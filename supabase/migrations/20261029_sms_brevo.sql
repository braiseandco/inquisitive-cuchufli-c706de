-- SMS clients envoyés par Brevo depuis le 29/10/2026 : Free a bloqué la ligne du resto 30 jours
-- (trop de SMS depuis un forfait mobile). SMS Gate reste pour les SMS internes (commandes, planning).
-- Clé API rangée dans le coffre par l'utilisateur, lisible par les fonctions serveur seulement :
--   select vault.create_secret('<clé>', 'brevo_api_key');
create or replace function public.brevo_api_key()
returns text
language sql
security definer
set search_path = public
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'brevo_api_key' $$;

revoke all on function public.brevo_api_key() from public, anon, authenticated;
grant execute on function public.brevo_api_key() to service_role;
