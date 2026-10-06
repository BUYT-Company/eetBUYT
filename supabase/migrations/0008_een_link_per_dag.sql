-- Eén actieve gedeelde bezorglink per dag: een nieuwe link maken trekt de oude voor die dag in.
-- Vervangt delivery_share_create uit migratie 0007 en geeft ook terug hoeveel links zijn ingetrokken.
-- Veilig om opnieuw uit te voeren.
create or replace function public.delivery_share_create(p_hash text, p_date date, p_by text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_exp timestamptz; v_revoked int;
begin
  update public.delivery_shares
     set revoked_at = now()
   where delivery_date = p_date and revoked_at is null and expires_at > now();
  get diagnostics v_revoked = row_count;

  insert into public.delivery_shares (token_hash, delivery_date, created_by, expires_at)
  values (p_hash, p_date, left(coalesce(nullif(p_by, ''), 'onbekend'), 60), now() + interval '24 hours')
  returning id, expires_at into v_id, v_exp;
  return jsonb_build_object('id', v_id, 'expires_at', v_exp, 'revoked', v_revoked);
end $$;

revoke all on function public.delivery_share_create(text, date, text) from public, anon, authenticated;
grant execute on function public.delivery_share_create(text, date, text) to service_role;
