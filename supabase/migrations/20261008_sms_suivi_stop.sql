-- Suivi des SMS envoyés par SMS Gate et liste des clients qui ont répondu STOP.
-- L'appli SMS Gate du téléphone du resto appelle la fonction sms-gate-webhook à chaque
-- changement d'état (envoyé, reçu, échec) et à chaque SMS reçu.

create table if not exists public.sms_envois (
  gate_id text primary key,
  telephone text not null,
  type text not null default 'relance_j30',
  etat text not null default 'Pending',
  raison text,
  cree_at timestamptz not null default now(),
  maj_at timestamptz not null default now()
);
create index if not exists sms_envois_cree_at on public.sms_envois (cree_at desc);

create table if not exists public.sms_stop (
  telephone text primary key,
  message text,
  recu_at timestamptz not null default now()
);

alter table public.sms_envois enable row level security;
alter table public.sms_stop enable row level security;
drop policy if exists lecture_appareils on public.sms_envois;
create policy lecture_appareils on public.sms_envois for select to authenticated using (true);
drop policy if exists lecture_appareils on public.sms_stop;
create policy lecture_appareils on public.sms_stop for select to authenticated using (true);

-- Jeton secret dans l'adresse du webhook : seul SMS Gate le connaît
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'smsgate_webhook_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'smsgate_webhook_token');
  end if;
end $$;

create or replace function public.sms_gate_webhook_token()
returns text
language sql
security definer
set search_path = public
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'smsgate_webhook_token' $$;

revoke all on function public.sms_gate_webhook_token() from public, anon, authenticated;
grant execute on function public.sms_gate_webhook_token() to service_role;

-- Les numéros ne restent pas plus de 60 jours dans le journal
select cron.unschedule('purge-sms-envois') where exists (select 1 from cron.job where jobname = 'purge-sms-envois');
select cron.schedule('purge-sms-envois', '15 4 * * *', $$delete from public.sms_envois where cree_at < now() - interval '60 days'$$);
