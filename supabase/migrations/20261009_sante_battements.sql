-- Dernier passage des tâches planifiées du PC, déposé par sante/battement.ps1 et lu par le mail
-- « Santé des automatisations ». Clé service_role seulement (RLS sans policy).
create table if not exists public.sante_battements (
  nom text primary key,
  dernier_passage timestamptz,
  resultat bigint,
  maj_at timestamptz not null default now()
);
alter table public.sante_battements enable row level security;

-- Tâches pg_cron actives en échec ces dernières 24 h (le schéma cron n'est pas exposé à l'API)
create or replace function public.sante_crons_en_echec()
returns table(nom text, echecs bigint, message text)
language sql security definer set search_path = public
as $$
  select j.jobname, count(*), max(d.return_message)
  from cron.job j join cron.job_run_details d on d.jobid = j.jobid
  where j.active and d.status <> 'succeeded' and d.start_time > now() - interval '1 day'
  group by j.jobname;
$$;
revoke all on function public.sante_crons_en_echec() from public, anon, authenticated;
grant execute on function public.sante_crons_en_echec() to service_role;

-- Prix d'achat qui ont bougé : chaque produit enregistré ces derniers jours dans le registre des achats
-- (la routine factures l'alimente avec quelques jours de retard, d'où created_at), comparé à son achat précédent.
create or replace function public.sante_prix_semaine(jours int default 7)
returns table(fournisseur text, produit text, unite text, ancien numeric, nouveau numeric, pct numeric, effet numeric, cours_du_jour boolean)
language sql security definer set search_path = public
as $$
  with l as (
    select a.*, coalesce(a.produit_id::text, a.fournisseur_id::text || '|' || coalesce(a.reference, a.designation)) cle
    from cmd_achats a where a.type = 'produit' and a.prix_base > 0
  ), n as (
    select distinct on (cle) * from l where created_at > now() - make_interval(days => jours)
    order by cle, date_livraison desc, created_at desc
  ), q as (
    select cle, sum(quantite_base) qte from l where created_at > now() - make_interval(days => jours) group by cle
  )
  select f.nom, coalesce(p.nom, n.designation), n.unite_base, a.prix_base, n.prix_base,
    round(100 * (n.prix_base - a.prix_base) / a.prix_base, 1), round((n.prix_base - a.prix_base) * q.qte, 2),
    coalesce(p.prix_variable, false)
  from n join q using (cle)
  cross join lateral (select prix_base from l where l.cle = n.cle and l.date_livraison < n.date_livraison
                      order by date_livraison desc, created_at desc limit 1) a
  left join cmd_fournisseurs f on f.id = n.fournisseur_id
  left join cmd_produits p on p.id = n.produit_id
  where abs(n.prix_base - a.prix_base) >= 0.005 * a.prix_base
  order by abs((n.prix_base - a.prix_base) * q.qte) desc;
$$;
revoke all on function public.sante_prix_semaine(int) from public, anon, authenticated;
grant execute on function public.sante_prix_semaine(int) to service_role;
