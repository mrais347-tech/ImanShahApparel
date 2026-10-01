begin;
create index order_items_variant_idx on order_items(variant_id);
create index orders_status_expiry_idx on orders(status,expires_at);
create index orders_created_idx on orders(created_at desc);
alter table orders add column bill_code text unique;
alter table orders add column bill_state text not null default 'new' check(bill_state in ('new','creating','ready'));
alter table orders add column payment_review boolean not null default false;
create table payment_receipts(invoice text primary key,order_id uuid not null references orders(id),amount_sen integer not null,created_at timestamptz not null default now());
alter table payment_receipts enable row level security;
revoke all on payment_receipts from anon,authenticated;

-- Only the API can claim bill creation. An uncertain network result is never
-- retried automatically: doing so could create two payable bills for one order.
create function checkout_claim(p_request uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders; claimed boolean:=false; begin
 perform pg_advisory_xact_lock(74821001); perform expire_orders();
 select * into o from orders where request_id=p_request for update;
 if not found then raise exception 'Order not found'; end if;
 if o.status='pending' and o.bill_state='new' then
  update orders set bill_state='creating' where id=o.id; claimed:=true;
 end if;
 return to_jsonb(o)||jsonb_build_object('claimed',claimed);
end $$;
create function checkout_attach(p_request uuid,p_bill text) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
 perform pg_advisory_xact_lock(74821001);
 if p_bill !~ '^[a-zA-Z0-9]+$' then raise exception 'Invalid bill'; end if;
 update orders set bill_code=p_bill,bill_state='ready' where request_id=p_request and bill_state='creating';
 if not found then raise exception 'Bill cannot be attached'; end if;
end $$;
create function checkout_status(p_request uuid) returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('reference',reference,'status',case when status='pending' and expires_at<=now() then 'expired' else status end,'total_sen',subtotal_sen+shipping_sen,'expires_at',expires_at,'bill_code',bill_code,'tracking',tracking,'payment_review',payment_review) from orders where request_id=p_request;
$$;
create function payment_order(p_reference text) returns jsonb language sql security definer set search_path=public,pg_temp as $$ select to_jsonb(o) from orders o where reference=p_reference; $$;
create function confirm_payment(p_reference text,p_bill text,p_invoice text,p_amount integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders; previous_count integer; begin
 perform pg_advisory_xact_lock(74821001); perform expire_orders();
 select * into o from orders where reference=p_reference for update;
 if not found or o.bill_code is distinct from p_bill or o.subtotal_sen+o.shipping_sen<>p_amount or length(p_invoice) not between 1 and 100 then raise exception 'Payment does not match order'; end if;
 if exists(select 1 from payment_receipts where invoice=p_invoice and order_id=o.id) then return; end if;
 select count(*) into previous_count from payment_receipts where order_id=o.id;
 insert into payment_receipts(invoice,order_id,amount_sen) values(p_invoice,o.id,p_amount);
 if previous_count>0 then
  update orders set payment_review=true where id=o.id;
 elsif o.status='pending' and o.expires_at>now() then
  update variants v set stock=v.stock-i.quantity from order_items i where i.order_id=o.id and v.id=i.variant_id;
  update orders set status='paid',paid_at=now(),updated_at=now() where id=o.id;
 else
  update orders set status='review',payment_review=true,paid_at=now(),updated_at=now() where id=o.id;
 end if;
 insert into order_events(order_id,action) values(o.id,'verified_payment');
end $$;
revoke all on function checkout_claim(uuid),checkout_attach(uuid,text),checkout_status(uuid),payment_order(text),confirm_payment(text,text,text,integer) from public,anon,authenticated;
grant execute on function checkout_claim(uuid),checkout_attach(uuid,text),checkout_status(uuid),payment_order(text),confirm_payment(text,text,text,integer) to service_role;
commit;
