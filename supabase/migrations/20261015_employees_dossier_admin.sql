-- Fiche salarié : dossier administratif en plus des champs du contrat
alter table public.employees
  add column if not exists email text,
  add column if not exists iban text,
  add column if not exists urgence_nom text,
  add column if not exists urgence_tel text,
  add column if not exists piece_identite text,
  add column if not exists piece_expiration date,
  add column if not exists mutuelle text,
  add column if not exists date_dpae date,
  add column if not exists date_visite_medicale date;
