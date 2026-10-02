begin;
create table public.shop_settings(id boolean primary key default true check(id), orders_open boolean not null default false, launch_at timestamptz not null default '2026-10-02T20:00:00+08:00', whatsapp text not null default '', shipping_sen integer check(shipping_sen between 0 and 100000));
insert into public.shop_settings(id) values(true);
create table public.shop_admins(user_id uuid primary key references auth.users(id));
create table public.variants(id text primary key, product_id text not null, color text not null, size text not null, price_sen integer check(price_sen between 100 and 1000000), stock integer not null default 0 check(stock between 0 and 100000), active boolean not null default false);
insert into public.variants(id,product_id,color,size,price_sen) select 'barrel-'||c.slug,'barrel-'||c.slug,c.color,'Free Size',8900 from (values('charcoal','Black'),('burgundy','Maroon'),('slate','Blue')) c(slug,color);
create table public.orders(id uuid primary key default gen_random_uuid(), request_id uuid not null unique, reference text not null unique default ('IS-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))), email text not null, customer_name text not null, phone text not null, address text not null, status text not null default 'pending' check(status in ('pending','paid','shipped','cancelled','expired','review')), subtotal_sen integer not null, shipping_sen integer not null, created_at timestamptz not null default now(), expires_at timestamptz not null default(now()+interval '24 hours'), paid_at timestamptz, tracking text, updated_at timestamptz not null default now());
create table public.order_items(order_id uuid not null references public.orders(id),variant_id text not null references public.variants(id),color text not null,size text not null,quantity integer not null check(quantity between 1 and 10),unit_price_sen integer not null,primary key(order_id,variant_id));
create table public.order_events(id bigint generated always as identity primary key,order_id uuid not null references public.orders(id),actor uuid,action text not null,created_at timestamptz not null default now());
create table public.order_limits(bucket text primary key, started_at timestamptz not null default now(), attempts integer not null default 1);
alter table public.shop_settings enable row level security;
alter table public.shop_admins enable row level security;
alter table public.variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.order_limits enable row level security;
-- No table access from the browser. Narrow RPCs below are the only entry points.
revoke all on public.shop_settings,public.shop_admins,public.variants,public.orders,public.order_items,public.order_events,public.order_limits from anon,authenticated;
create function public.require_shop_admin() returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not exists(select 1 from shop_admins where user_id=auth.uid()) then raise exception 'Admin access required'; end if;
end $$;
create function public.expire_orders() returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
 update orders set status='expired',updated_at=now() where status='pending' and expires_at<=now();
end $$;
create function public.shop_catalog() returns jsonb language sql security definer set search_path=public,pg_temp as $$
select jsonb_build_object('ready',s.orders_open and now()>=s.launch_at and s.shipping_sen is not null,'shipping_sen',s.shipping_sen,'launch_at',s.launch_at,'variants',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'product_id',v.product_id,'color',v.color,'size',v.size,'price_sen',v.price_sen,'available',greatest(0,v.stock-coalesce((select sum(i.quantity) from order_items i join orders o on o.id=i.order_id where i.variant_id=v.id and o.status='pending' and o.expires_at>now()),0))))from variants v where v.active and v.price_sen is not null),'[]'::jsonb)) from shop_settings s;
$$;
create function public.order_rate_limit(p_bucket text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$ declare n integer; begin
 insert into order_limits(bucket)values(p_bucket) on conflict(bucket) do update set attempts=case when order_limits.started_at<now()-interval '1 hour' then 1 else order_limits.attempts+1 end,started_at=case when order_limits.started_at<now()-interval '1 hour' then now() else order_limits.started_at end returning attempts into n;
 delete from order_limits where started_at<now()-interval '2 days';
 return n<=5;
end $$;
create function public.place_order(p_request uuid,p_customer jsonb,p_items jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s shop_settings; o orders; v variants; item jsonb; total integer:=0; reserved integer; qty integer; begin
 -- One lock serializes inventory changes, reservations, expiry, and admin transitions.
 perform pg_advisory_xact_lock(74821001);
 perform expire_orders();
 select * into o from orders where request_id=p_request;
 if found then
  if o.email is distinct from trim(p_customer->>'email') or o.customer_name<>trim(p_customer->>'name') or o.phone<>trim(p_customer->>'phone') or o.address<>trim(p_customer->>'address') then raise exception 'Request already used'; end if;
  if (select jsonb_agg(jsonb_build_object('variant_id',i.variant_id,'quantity',i.quantity) order by i.variant_id)from order_items i where i.order_id=o.id) is distinct from (select jsonb_agg(e order by e->>'variant_id')from jsonb_array_elements(p_items)e) then raise exception 'Request already used';end if;
 else
  select * into s from shop_settings where id=true;
  if not s.orders_open or now()<s.launch_at or s.shipping_sen is null then raise exception 'Orders are not open'; end if;
  if coalesce(p_customer->>'email','') !~ '^[^ @]+@[^ @]+[.][^ @]+$' or length(p_customer->>'email')>254 or length(trim(coalesce(p_customer->>'name','')))<2 or length(p_customer->>'name')>100 or coalesce(p_customer->>'phone','') !~ '^\+?[0-9]{8,15}$' or length(trim(coalesce(p_customer->>'address','')))<15 or length(p_customer->>'address')>600 then raise exception 'Check your contact and delivery details';end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)not between 1 and 12 then raise exception 'Invalid bag';end if;
  if (select count(distinct e->>'variant_id')from jsonb_array_elements(p_items)e)<>jsonb_array_length(p_items) then raise exception 'Duplicate variant';end if;
  for item in select * from jsonb_array_elements(p_items) loop
   if coalesce(item->>'quantity','') !~ '^[0-9]+$' then raise exception 'Invalid quantity';end if;
   qty:=(item->>'quantity')::integer;if qty not between 1 and 10 then raise exception 'Invalid quantity';end if;
   select * into v from variants where id=item->>'variant_id' and active and price_sen is not null;
   if not found then raise exception 'Variant unavailable';end if;
   select coalesce(sum(i.quantity),0)into reserved from order_items i join orders oo on oo.id=i.order_id where i.variant_id=v.id and oo.status='pending' and oo.expires_at>now();
   if v.stock-reserved<qty then raise exception 'A selected colour no longer has enough stock';end if;
   total:=total+v.price_sen*qty;
  end loop;
  insert into orders(request_id,email,customer_name,phone,address,subtotal_sen,shipping_sen)values(p_request,trim(p_customer->>'email'),trim(p_customer->>'name'),trim(p_customer->>'phone'),trim(p_customer->>'address'),total,s.shipping_sen)returning * into o;
  insert into order_items select o.id,vv.id,vv.color,vv.size,(e->>'quantity')::integer,vv.price_sen from jsonb_array_elements(p_items)e join variants vv on vv.id=e->>'variant_id';
  insert into order_events(order_id,action)values(o.id,'created');
 end if;
 select * into s from shop_settings where id=true;
 return jsonb_build_object('reference',o.reference,'status',o.status,'expires_at',o.expires_at,'total_sen',o.subtotal_sen+o.shipping_sen,'whatsapp',s.whatsapp,'items',(select jsonb_agg(jsonb_build_object('color',i.color,'size',i.size,'quantity',i.quantity))from order_items i where i.order_id=o.id));
end $$;
create function public.admin_dashboard() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin
 perform require_shop_admin();perform pg_advisory_xact_lock(74821001);perform expire_orders();
 return jsonb_build_object('settings',(select to_jsonb(s)from shop_settings s),'variants',(select jsonb_agg(to_jsonb(v)order by v.id)from variants v),'orders',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc)from(select o.*,(select jsonb_agg(to_jsonb(i))from order_items i where i.order_id=o.id)items from orders o order by o.created_at desc limit 200)x),'[]'::jsonb));
end $$;
create function public.admin_save_variant(p_id text,p_price integer,p_stock integer,p_active boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare held integer;begin
 perform require_shop_admin();perform pg_advisory_xact_lock(74821001);perform expire_orders();
 select coalesce(sum(i.quantity),0)into held from order_items i join orders o on o.id=i.order_id where i.variant_id=p_id and o.status='pending';
 if p_stock<held then raise exception 'Stock cannot be lower than current reservations';end if;
 if p_active and p_price is null then raise exception 'Set a price before activating';end if;
 update variants set price_sen=p_price,stock=p_stock,active=p_active where id=p_id;
 if not found then raise exception 'Variant not found';end if;
end $$;
create function public.admin_save_settings(p_open boolean,p_launch timestamptz,p_whatsapp text,p_shipping integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
 perform require_shop_admin();perform pg_advisory_xact_lock(74821001);
 if p_open and p_shipping is null then raise exception 'Set shipping first';end if;
 update shop_settings set orders_open=p_open,launch_at=p_launch,whatsapp=p_whatsapp,shipping_sen=p_shipping;
end $$;
create function public.admin_order_status(p_id uuid,p_status text,p_tracking text default '') returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare o orders;begin
 perform require_shop_admin();perform pg_advisory_xact_lock(74821001);perform expire_orders();select * into o from orders where id=p_id;
 if not found then raise exception 'Order not found';end if;
 if o.status=p_status then return;end if;
 if not((o.status='pending' and p_status='cancelled')or(o.status='paid' and p_status='shipped'))then raise exception 'Invalid status transition; expired orders need a new reservation';end if;
 if p_status='paid' then
  update variants v set stock=v.stock-i.quantity from order_items i where i.order_id=o.id and v.id=i.variant_id;
 end if;
 if p_status='shipped' and length(trim(coalesce(p_tracking,'')))not between 3 and 200 then raise exception 'Enter courier and tracking number';end if;
 update orders set status=p_status,paid_at=case when p_status='paid' then now() else paid_at end,tracking=case when p_status='shipped' then trim(p_tracking)else tracking end,updated_at=now()where id=p_id;
 insert into order_events(order_id,actor,action)values(p_id,auth.uid(),p_status);
end $$;
revoke all on function public.require_shop_admin(),public.expire_orders(),public.order_rate_limit(text),public.place_order(uuid,jsonb,jsonb),public.shop_catalog(),public.admin_dashboard(),public.admin_save_variant(text,integer,integer,boolean),public.admin_save_settings(boolean,timestamptz,text,integer),public.admin_order_status(uuid,text,text) from public,anon,authenticated;
grant execute on function public.shop_catalog() to anon,authenticated;
grant execute on function public.order_rate_limit(text),public.place_order(uuid,jsonb,jsonb) to service_role;
grant execute on function public.admin_dashboard(),public.admin_save_variant(text,integer,integer,boolean),public.admin_save_settings(boolean,timestamptz,text,integer),public.admin_order_status(uuid,text,text) to authenticated;
commit;
