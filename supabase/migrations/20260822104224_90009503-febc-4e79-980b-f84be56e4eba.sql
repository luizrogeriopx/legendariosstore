create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$$;

revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

drop policy if exists "Users can read their own roles" on public.user_roles;
create policy "Users can read their own roles"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid());