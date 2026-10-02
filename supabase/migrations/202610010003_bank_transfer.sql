begin;
alter table orders add column payment_method text not null default 'toyyibpay' check(payment_method in ('toyyibpay','bank_transfer'));
alter table orders add column payment_reported_at timestamptz;
alter table orders add column bank_details jsonb;
create table bank_receipts(bank_reference text primary key,order_id uuid not null unique references orders(id),amount_sen integer not null,verified_by uuid not null references auth.users(id),verified_at timestamptz not null default now());
alter table bank_receipts enable row level security;
revoke all on bank_receipts from public,anon,authenticated;

create function bank_checkout(p_request uuid,p_customer jsonb,p_items jsonb,p_bank jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare existed boolean; o orders; begin
 if coalesce(p_bank->>'account','') !~ '^[0-9]{8,30}$' or length(trim(coalesce(p_bank->>'name',''))) not between 2 and 150 or length(trim(coalesce(p_bank->>'bank',''))) not between 2 and 100 then raise exception 'Bank details are not configured'; end if;
 perform pg_advisory_xact_lock(74821001);
 select exists(select 1 from orders where request_id=p_request) into existed;
 perform place_order(p_request,p_customer,p_items);
 select * into o from orders where request_id=p_request;
 if existed and o.payment_method<>'bank_transfer' then raise exception 'Request already used'; end if;
 if not existed then
  update orders set payment_method='bank_transfer',bank_details=jsonb_build_object('name',p_bank->>'name','bank',p_bank->>'bank','account',p_bank->>'account') where id=o.id;
 end if;
 return jsonb_build_object('reference',o.reference,'status',o.status,'total_sen',o.subtotal_sen+o.shipping_sen,'expires_at',o.expires_at);
end $$;

create or replace function checkout_status(p_request uuid) returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('reference',reference,'status',case when status='pending' and expires_at<=now() then 'expired' else status end,'total_sen',subtotal_sen+shipping_sen,'expires_at',expires_at,'bill_code',bill_code,'tracking',tracking,'payment_review',payment_review,'payment_method',payment_method,'payment_reported_at',payment_reported_at,'bank_details',case when status='pending' and expires_at>now() then bank_details else null end) from orders where request_id=p_request;
$$;

create function report_bank_payment(p_request uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders; begin
 perform pg_advisory_xact_lock(74821001); perform expire_orders();
 select * into o from orders where request_id=p_request;
 if not found or o.payment_method<>'bank_transfer' then raise exception 'Order not found'; end if;
 if o.status<>'pending' then raise exception 'Reservation is no longer pending'; end if;
 if o.payment_reported_at is not null then return; end if;
 update orders set payment_reported_at=now(),updated_at=now() where id=o.id;
 insert into order_events(order_id,action) values(o.id,'customer_reported_bank_payment');
 -- This is a notification, never proof of payment. Do not deduct stock here.
end $$;

create function admin_confirm_bank_payment(p_id uuid,p_bank_reference text,p_amount integer) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders; txn text:=upper(trim(p_bank_reference)); insufficient boolean; begin
 perform require_shop_admin(); perform pg_advisory_xact_lock(74821001); perform expire_orders();
 select * into o from orders where id=p_id;
 if not found or o.payment_method<>'bank_transfer' then raise exception 'Bank transfer order not found'; end if;
 if p_amount is distinct from o.subtotal_sen+o.shipping_sen then raise exception 'Received amount must match the order total'; end if;
 if txn is null or length(txn) not between 3 and 100 then raise exception 'Enter the bank transaction reference'; end if;
 if exists(select 1 from bank_receipts where order_id=o.id and bank_reference=txn and amount_sen=p_amount) then return o.status; end if;
 if o.status not in ('pending','expired') then raise exception 'This order cannot be confirmed'; end if;
 if exists(select 1 from bank_receipts where bank_reference=txn or order_id=o.id) then raise exception 'Bank transaction or order already confirmed'; end if;
 select exists(select 1 from order_items i join variants v on v.id=i.variant_id where i.order_id=o.id and v.stock-coalesce((select sum(other.quantity) from order_items other join orders held on held.id=other.order_id where other.variant_id=i.variant_id and held.id<>o.id and held.status='pending' and held.expires_at>now()),0)<i.quantity) into insufficient;
 insert into bank_receipts(bank_reference,order_id,amount_sen,verified_by) values(txn,o.id,p_amount,auth.uid());
 if insufficient then
  update orders set status='review',payment_review=true,paid_at=now(),updated_at=now() where id=o.id;
 else
  update variants v set stock=v.stock-i.quantity from order_items i where i.order_id=o.id and v.id=i.variant_id;
  update orders set status='paid',paid_at=now(),updated_at=now() where id=o.id;
 end if;
 insert into order_events(order_id,actor,action) values(o.id,auth.uid(),'admin_verified_bank_payment');
 return case when insufficient then 'review' else 'paid' end;
end $$;
revoke all on function bank_checkout(uuid,jsonb,jsonb,jsonb),report_bank_payment(uuid),admin_confirm_bank_payment(uuid,text,integer) from public,anon,authenticated;
grant execute on function bank_checkout(uuid,jsonb,jsonb,jsonb),report_bank_payment(uuid) to service_role;
grant execute on function admin_confirm_bank_payment(uuid,text,integer) to authenticated;
commit;
