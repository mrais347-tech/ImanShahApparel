begin;
update shop_settings set shipping_sen=1000;
create table order_emails(order_id uuid not null references orders(id),kind text not null check(kind in ('pending','paid')),state text not null default 'queued' check(state in ('queued','sending','sent','failed','skipped')),claim uuid,attempts integer not null default 0,updated_at timestamptz not null default now(),primary key(order_id,kind));
alter table order_emails enable row level security;
revoke all on order_emails from public,anon,authenticated;
create function queue_order_email() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if new.payment_method='bank_transfer' then
  if old.payment_method is distinct from new.payment_method then insert into order_emails(order_id,kind) values(new.id,'pending') on conflict do nothing; end if;
  if new.status='paid' and old.status is distinct from new.status then insert into order_emails(order_id,kind) values(new.id,'paid') on conflict do nothing; end if;
 end if;
 return new;
end $$;
create trigger order_email_queue after update on orders for each row execute function queue_order_email();
create function claim_order_email(p_reference text,p_kind text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders; job order_emails; token uuid:=gen_random_uuid(); begin
 perform pg_advisory_xact_lock(74821001);
 select * into o from orders where reference=p_reference;
 if not found then return null; end if;
 select * into job from order_emails where order_id=o.id and kind=p_kind for update;
 if not found or job.state in ('sent','skipped') or (job.state='sending' and job.updated_at>now()-interval '5 minutes') or job.attempts>=5 then return null; end if;
 if (p_kind='pending' and (o.status<>'pending' or o.expires_at<=now())) or (p_kind='paid' and o.status not in ('paid','shipped')) then
  update order_emails set state='skipped',updated_at=now() where order_id=o.id and kind=p_kind; return null;
 end if;
 update order_emails set state='sending',claim=token,attempts=attempts+1,updated_at=now() where order_id=o.id and kind=p_kind;
 return to_jsonb(o)||jsonb_build_object('claim',token,'kind',p_kind,'items',(select jsonb_agg(to_jsonb(i)) from order_items i where i.order_id=o.id));
end $$;
create function finish_order_email(p_claim uuid,p_sent boolean) returns void language sql security definer set search_path=public,pg_temp as $$
 update order_emails set state=case when p_sent then 'sent' else 'failed' end,updated_at=now() where claim=p_claim and state='sending';
$$;
create function admin_email_order(p_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare o orders; begin
 perform require_shop_admin(); select * into o from orders where id=p_id;
 if not found then raise exception 'Order not found'; end if;
 return jsonb_build_object('reference',o.reference,'status',o.status);
end $$;
create or replace function admin_dashboard() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin
 perform require_shop_admin();perform pg_advisory_xact_lock(74821001);perform expire_orders();
 return jsonb_build_object('settings',(select to_jsonb(s)from shop_settings s),'variants',(select jsonb_agg(to_jsonb(v)order by v.id)from variants v),'orders',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc)from(select o.*,(select jsonb_agg(to_jsonb(i))from order_items i where i.order_id=o.id)items,(select jsonb_object_agg(e.kind,e.state)from order_emails e where e.order_id=o.id)emails from orders o order by o.created_at desc limit 200)x),'[]'::jsonb));
end $$;
revoke all on function queue_order_email(),claim_order_email(text,text),finish_order_email(uuid,boolean),admin_email_order(uuid) from public,anon,authenticated;
grant execute on function claim_order_email(text,text),finish_order_email(uuid,boolean) to service_role;
grant execute on function admin_email_order(uuid) to authenticated;
commit;
