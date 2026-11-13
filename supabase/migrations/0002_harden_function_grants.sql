-- Trigger functions don't need to be callable through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_profile_update() from public, anon, authenticated;
revoke execute on function public.guard_time_entry() from public, anon, authenticated;

-- Helpers used by RLS and the timer RPCs: signed-in users only.
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.month_of(timestamptz) from public, anon;
revoke execute on function public.is_month_locked(timestamptz) from public, anon;
revoke execute on function public.start_timer(uuid, uuid, text) from public, anon;
revoke execute on function public.stop_timer() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.month_of(timestamptz) to authenticated;
grant execute on function public.is_month_locked(timestamptz) to authenticated;
grant execute on function public.start_timer(uuid, uuid, text) to authenticated;
grant execute on function public.stop_timer() to authenticated;
