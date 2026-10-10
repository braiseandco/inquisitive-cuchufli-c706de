-- Rappels réseaux du patron : un Reel de la Page est aussi à poster sur ses 3 comptes Facebook perso,
-- un compte par jour (lignes reel_perso de la file). Le texte du SMS de rappel est gardé pour ne pas
-- envoyer deux fois le même dans la même fenêtre.
alter table public.social_scheduled_posts drop constraint social_scheduled_posts_type_check;
alter table public.social_scheduled_posts add constraint social_scheduled_posts_type_check
  check (type = any (array['carrousel', 'photo', 'story', 'reel_rappel', 'partage', 'reel_perso']));

alter table public.sms_envois add column if not exists texte text;
