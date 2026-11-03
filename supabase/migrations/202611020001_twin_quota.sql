-- All quota reservations serialize on a single row before any paid request.
create table if not exists public.twin_control (
 id boolean primary key default true check (id), enabled boolean not null default true
);
insert into public.twin_control(id) values(true) on conflict do nothing;
create table if not exists public.twin_usage (
 bucket text not null, period text not null, used integer not null default 0,
 last_at timestamptz, primary key(bucket,period)
);
alter table public.twin_control enable row level security;
alter table public.twin_usage enable row level security;
revoke all on public.twin_control, public.twin_usage from public, anon, authenticated;
create or replace function public.reserve_twin_quota(browser_hash text, ip_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 now_at timestamptz := clock_timestamp();
 day_key text := to_char(now_at at time zone 'Asia/Shanghai','YYYY-MM-DD');
 month_key text := to_char(now_at at time zone 'Asia/Shanghai','YYYY-MM');
 keys text[]; periods text[]; caps integer[] := array[10,20,100,1000];
 n integer; count_used integer; last_used timestamptz; is_enabled boolean;
begin
 if browser_hash !~ '^[0-9a-f]{64}$' or ip_hash !~ '^[0-9a-f]{64}$' or browser_hash is null or ip_hash is null then
  raise exception 'invalid identity';
 end if;
 select enabled into is_enabled from public.twin_control where id=true for update;
 if is_enabled is distinct from true then return jsonb_build_object('allowed',false,'code','disabled'); end if;
 keys := array['browser:'||browser_hash,'ip:'||ip_hash,'global-day','global-month'];
 periods := array[day_key,day_key,day_key,month_key];
 for n in 1..4 loop
  select used,last_at into count_used,last_used from public.twin_usage where bucket=keys[n] and period=periods[n];
  if coalesce(count_used,0)>=caps[n] then return jsonb_build_object('allowed',false,'code','quota'); end if;
  if n<=2 and last_used>now_at-interval '10 seconds' then return jsonb_build_object('allowed',false,'code','cooldown'); end if;
 end loop;
 for n in 1..4 loop
  insert into public.twin_usage(bucket,period,used,last_at) values(keys[n],periods[n],1,now_at)
  on conflict(bucket,period) do update set used=public.twin_usage.used+1,last_at=excluded.last_at;
 end loop;
 -- Retain only current and previous month; no chat content or raw IP stored.
 delete from public.twin_usage where period < to_char((now_at at time zone 'Asia/Shanghai')-interval '1 month','YYYY-MM');
 select used into count_used from public.twin_usage where bucket=keys[1] and period=day_key;
 return jsonb_build_object('allowed',true,'remaining',10-count_used);
end $$;
revoke all on function public.reserve_twin_quota(text,text) from public,anon,authenticated;
grant execute on function public.reserve_twin_quota(text,text) to service_role;
