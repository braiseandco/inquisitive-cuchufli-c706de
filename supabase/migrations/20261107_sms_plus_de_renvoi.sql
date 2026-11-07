-- Plus de renvoi automatique des SMS en échec. Cette règle datait des coupures du téléphone SMS Gate ;
-- chez Brevo le renvoi partait quelques minutes après l'échec : 1 SMS sauvé sur 19, les autres payés pour rien.
-- Les colonnes essai et origine restent : l'historique de sms_envois s'en sert.
drop trigger if exists sms_envois_renvoi on public.sms_envois;
drop function if exists public.sms_envois_renvoi();
drop function if exists public.sms_prochain_creneau();

-- Renvois encore en attente
delete from public.sms_programmes where origine is not null;
