-- Confirmation automatique des réservations : mail + SMS sans intervention.
--
-- 1. Une réservation en ligne arrive « en-attente » : elle passe tout de suite en « confirmee »,
--    sauf si elle tombe pendant une fermeture (lundi, soir du dimanche au jeudi) : elle reste
--    alors en attente, sans mail ni SMS.
-- 2. Toute nouvelle réservation confirmée (en ligne ou saisie par l'équipe), ou passée en
--    « confirmee » par l'équipe, est marquée « a-envoyer » et la fonction sms-confirmation est
--    appelée : elle envoie le SMS depuis le téléphone Android du resto (appli SMS Gateway,
--    api.sms-gate.app) et, pour les réservations en ligne, le mail de confirmation.
-- 3. Si le SMS ne part pas, la résa passe en « erreur » et la fenêtre SMS manuelle de
--    l'appli téléphone reprend la main, comme avant.

alter table public.reservations
  add column if not exists sms_auto text,
  add column if not exists sms_auto_at timestamptz,
  add column if not exists sms_auto_erreur text;

create or replace function public.sms_confirmation_auto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  auto_confirmee boolean := false;
  jour int := extract(isodow from new.date);  -- 1 = lundi … 7 = dimanche
  -- Horaires du site : midi du mardi au dimanche, soir le vendredi et le samedi, fermé le lundi
  ouvert boolean := jour <> 1 and (new.heure < '15:00' or (jour in (5, 6) and new.heure >= '18:00'));
begin
  if new.id like 'roulette\_%' or new.id like 'fid\_%'
     or new.date < (now() at time zone 'Europe/Paris')::date then
    return new;
  end if;

  -- Seul ce déclencheur décide d'un envoi : une valeur venue de l'extérieur est ignorée
  if tg_op = 'INSERT' then
    new.sms_auto := null;
    new.sms_auto_at := null;
    -- Résa pendant une fermeture (lundi, soir en semaine…) : elle reste en attente, sans mail
    -- ni SMS, pour que le patron rappelle le client
    if not ouvert and auth.role() is distinct from 'authenticated' then
      return new;
    end if;
    if new.statut = 'en-attente' then
      new.statut := 'confirmee';
      auto_confirmee := true;
    end if;
  end if;

  if new.statut = 'confirmee'
     and (tg_op = 'INSERT' or (old.statut is distinct from 'confirmee' and auth.role() = 'authenticated'))
     and coalesce(new.sms_envoye, false) = false
  then
    new.sms_auto := 'a-envoyer';
    new.sms_auto_at := now();
    new.sms_auto_erreur := null;
    -- pg_net n'envoie la requête qu'après la validation de la transaction : la résa est alors lisible.
    -- Le mail n'est envoyé ici que pour les confirmations automatiques : quand l'équipe confirme
    -- à la main, l'appli l'envoie déjà elle-même.
    perform net.http_post(
      url := 'https://ugyrrnqpapeagpuocwob.supabase.co/functions/v1/sms-confirmation',
      body := jsonb_build_object('id', new.id, 'mail', auto_confirmee),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 30000
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sms_confirmation_auto on public.reservations;
-- Nom après trg_extract_telephone : le téléphone tiré des notes est déjà en place
create trigger trg_sms_confirmation_auto
  before insert or update on public.reservations
  for each row execute function public.sms_confirmation_auto();

-- Identifiants SMS Gateway rangés dans le coffre (Vault) : lisibles par la fonction seulement
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
