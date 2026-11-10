-- Relance J+30 remise en place le 10/11/2026, par mail seulement (les SMS J+30 restent supprimés).
-- La liste des clients à relancer est calculée ici, une seule fois pour l'appli et pour la
-- fonction relances-mail : avant, chacune refaisait le calcul de son côté, sur 1000 résas au plus.

-- Clients qui ont cliqué sur « Se désinscrire » en bas d'un mail de relance
create table if not exists public.mail_stop (
  email text primary key,
  recu_at timestamptz not null default now()
);
alter table public.mail_stop enable row level security;
drop policy if exists lecture_appareils on public.mail_stop;
create policy lecture_appareils on public.mail_stop for select to authenticated using (true);

-- Client = adresse mail. Dernière venue = sa résa la plus récente, ou une résa plus récente prise
-- avec le même téléphone sans mail ; une résa à venir compte aussi (pas de relance à qui a déjà
-- réservé). Relancé si cette dernière venue date d'il y a 29 jours ou plus, que sa dernière résa
-- n'a pas déjà servi à une relance (SMS ou mail) et qu'il n'a dit STOP ni par mail ni par SMS.
-- security invoker : la fonction ne lit que ce que l'appelant a déjà le droit de lire.
create or replace function public.relance_j30_mail()
returns table (email text, nom text, derniere date, nb bigint)
language sql
stable
set search_path = public
as $$
  with jour as (select (now() at time zone 'Europe/Paris')::date as j),
  r as (
    select lower(trim(x.email)) as em,
           nullif(right(regexp_replace(coalesce(x.telephone, ''), '\D', '', 'g'), 9), '') as tk,
           trim(x.nom) as nom, x.date, coalesce(x.relance_mois_envoye, false) as f
    from public.reservations x, jour
    where x.id not like 'roulette\_%' and x.id not like 'fid\_%'
      and x.statut in ('confirmee', 'arrivee', 'en-attente')
      and x.date >= jour.j - 183
  ),
  par_tel as (select tk, max(date) as d from r where tk ~ '[1-9]' group by tk),
  dernier as (
    select distinct on (em) em, nom, f from r
    where em ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    order by em, date desc, f desc
  ),
  par_mail as (
    select r.em, greatest(max(r.date), max(t.d)) as derniere, count(*) as nb
    from r left join par_tel t on t.tk = r.tk
    where r.em is not null
    group by r.em
  )
  select d.em, d.nom, p.derniere, p.nb
  from dernier d join par_mail p on p.em = d.em, jour
  where p.derniere <= jour.j - 29
    and not d.f
    and not exists (select 1 from public.mail_stop s where s.email = d.em)
    and not exists (
      select 1 from r join public.sms_stop s on right(regexp_replace(s.telephone, '\D', '', 'g'), 9) = r.tk
      where r.em = d.em)
  order by p.derniere
$$;
revoke all on function public.relance_j30_mail() from public;
grant execute on function public.relance_j30_mail() to anon, authenticated, service_role;

-- Lien « Se désinscrire » des mails : signé avec le jeton secret du webhook SMS, pour qu'on ne
-- puisse pas désinscrire l'adresse de quelqu'un d'autre. Même calcul que lienDesinscription()
-- dans la fonction relances-mail.
create or replace function public.desinscription_mail(e text, k text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  m text := lower(trim(coalesce(e, '')));
begin
  if m = '' or k is distinct from encode(extensions.hmac(m, public.sms_gate_webhook_token(), 'sha256'), 'hex') then
    return false;
  end if;
  insert into public.mail_stop (email) values (m) on conflict (email) do nothing;
  return true;
end
$$;
revoke all on function public.desinscription_mail(text, text) from public;
grant execute on function public.desinscription_mail(text, text) to anon, authenticated;
