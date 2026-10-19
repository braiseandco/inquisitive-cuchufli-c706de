-- SMS en échec renvoyés tout seuls. Le 18/10/2026 le téléphone a perdu le réseau en plein envoi :
-- 36 SMS de bienvenue perdus, et le renvoyer tout de suite échouerait pareil. Un SMS en échec attend
-- donc dans sms_programmes (envoyer_at vide) ; chaque SMS reçu ensuite prouve que le téléphone
-- refonctionne et libère le plus ancien en attente, un par un pour ne pas déclencher l'anti-spam
-- de l'opérateur. Deux renvois au plus par SMS, entre 10h30 et 20h.

alter table public.sms_envois add column if not exists essai int not null default 0;
alter table public.sms_programmes add column if not exists essai int not null default 0;
alter table public.sms_programmes add column if not exists origine text;
alter table public.sms_programmes alter column envoyer_at drop not null;

create or replace function public.sms_prochain_creneau()
returns timestamptz language sql stable as $$
  select case
    when (now() at time zone 'Europe/Paris')::time between '10:30' and '20:00' then now()
    else ((((now() at time zone 'Europe/Paris') + case when (now() at time zone 'Europe/Paris')::time > '20:00'
      then interval '1 day' else interval '0' end)::date + time '10:30') at time zone 'Europe/Paris')
  end
$$;

create or replace function public.sms_envois_renvoi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.etat = 'Failed' and old.etat is distinct from 'Failed' and new.texte is not null and new.essai < 2 then
    insert into sms_programmes (telephone, texte, envoyer_at, type, essai, origine)
    values ('+33' || substr(new.telephone, 2), new.texte, null, new.type, new.essai + 1, new.gate_id);
  elsif new.etat = 'Delivered' and old.etat is distinct from 'Delivered' then
    -- Accusé arrivé après coup : ce SMS-là n'était pas perdu
    delete from sms_programmes where origine = new.gate_id and envoyer_at is null;
    update sms_programmes set envoyer_at = sms_prochain_creneau()
    where id = (select id from sms_programmes where envoyer_at is null order by id limit 1);
  end if;
  return new;
end $$;

drop trigger if exists sms_envois_renvoi on public.sms_envois;
create trigger sms_envois_renvoi after update of etat on public.sms_envois
  for each row execute function public.sms_envois_renvoi();
