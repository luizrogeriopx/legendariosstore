create type public.app_role as enum ('admin', 'user');

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text,
  price numeric(12,2),
  original_price numeric(12,2),
  discount_pct int,
  shopee_url text not null,
  category text,
  rating numeric(2,1),
  sold_count int default 0,
  featured boolean default false,
  sort_order int default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.products to anon;
grant select on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;

create policy "Anyone can view products"
  on public.products for select
  to anon, authenticated
  using (true);

create policy "Admins can insert products"
  on public.products for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update products"
  on public.products for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete products"
  on public.products for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger update_products_updated_at
  before update on public.products
  for each row execute function public.update_updated_at_column();