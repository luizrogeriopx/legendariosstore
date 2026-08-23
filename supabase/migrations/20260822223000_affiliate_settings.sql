create table if not exists public.affiliate_settings (
  id text primary key default 'default',
  shopee_app_id text,
  shopee_secret text,
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.affiliate_settings to authenticated;
alter table public.affiliate_settings enable row level security;

create policy "Admins can view affiliate settings"
  on public.affiliate_settings for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can insert affiliate settings"
  on public.affiliate_settings for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update affiliate settings"
  on public.affiliate_settings for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
