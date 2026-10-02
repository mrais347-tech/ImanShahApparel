begin;
-- Opening quantities supplied by the store owner on October 1, 2026.
-- Refuse to overwrite live inventory if this migration is applied too late.
do $$ begin
 if exists(select 1 from orders) then raise exception 'Opening stock must be reviewed manually because orders already exist'; end if;
 update variants set stock=case id when 'barrel-slate' then 7 when 'barrel-burgundy' then 7 when 'barrel-charcoal' then 3 end,active=true where id in ('barrel-slate','barrel-burgundy','barrel-charcoal');
end $$;
-- Shipping and the global order switch intentionally remain unset/closed.
commit;
