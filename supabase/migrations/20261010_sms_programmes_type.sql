-- SMS de bienvenue (J+1) programmés pour 10h30 : le type suit le SMS jusqu'à sms_envois
alter table public.sms_programmes add column if not exists type text not null default 'relance_j30';
