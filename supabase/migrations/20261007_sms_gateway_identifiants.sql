-- Identifiants SMS Gate rangés dans le coffre (Vault) : lisibles par les fonctions serveur seulement.
-- À poser une fois dans l'éditeur SQL Supabase :
--   select vault.create_secret('<utilisateur>', 'smsgate_user');
--   select vault.create_secret('<mot de passe>', 'smsgate_pass');
create or replace function public.sms_gateway_identifiants()
returns table(utilisateur text, mot_de_passe text)
language sql
security definer
set search_path = public
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'smsgate_user'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'smsgate_pass');
$$;

revoke all on function public.sms_gateway_identifiants() from public, anon, authenticated;
grant execute on function public.sms_gateway_identifiants() to service_role;
