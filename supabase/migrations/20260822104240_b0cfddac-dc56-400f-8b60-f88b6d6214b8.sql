create or replace function public.assign_initial_admin_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  else
    insert into public.user_roles (user_id, role) values (new.id, 'user')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.assign_initial_admin_role() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_initial_admin on auth.users;
create trigger on_auth_user_created_initial_admin
  after insert on auth.users
  for each row execute function public.assign_initial_admin_role();