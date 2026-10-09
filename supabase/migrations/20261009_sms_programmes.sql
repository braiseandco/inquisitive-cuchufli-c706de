-- Relances lancées avant 10h30 ou après 20h : gardées ici jusqu'à 10h30, puis envoyées à SMS Gate
-- en envoi immédiat. Un SMS programmé sur le téléphone (scheduleAt) part bien à l'heure, mais le
-- téléphone ne renvoie jamais son état (envoyé, reçu) : l'appli le croyait bloqué (09/10/2026).

create table if not exists public.sms_programmes (
  id bigserial primary key,
  telephone text not null,
  texte text not null,
  envoyer_at timestamptz not null,
  tentatives int not null default 0,
  cree_at timestamptz not null default now()
);

alter table public.sms_programmes enable row level security;
drop policy if exists lecture_appareils on public.sms_programmes;
create policy lecture_appareils on public.sms_programmes for select to authenticated using (true);

-- Toutes les 5 min, la fonction n'est appelée que s'il y a des SMS à faire partir
select cron.unschedule('sms-programmes') where exists (select 1 from cron.job where jobname = 'sms-programmes');
select cron.schedule('sms-programmes', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://ugyrrnqpapeagpuocwob.supabase.co/functions/v1/relances-sms',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', public.sms_gate_webhook_token()),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  where exists (select 1 from public.sms_programmes where envoyer_at <= now() and tentatives < 3)
$$);
