/* ═══════════ Alerte : la routine BL n'a pas envoyé son récap ═══════════
   La routine du PC (tâche Windows « Réception BL », mercredi et samedi à 15h)
   envoie à chaque passage un mail « Réception du … » de braiseandcobiganos à
   braiseandcobiganos. Quand elle ne passe pas (PC éteint, limite de dépense du
   compte Claude, Drive absent), rien ne le dit : ce script vérifie le jeudi et
   le dimanche à 8h qu'un récap est arrivé dans les 24 h, sinon il prévient.

   Installation (compte braiseandcobiganos) : script.google.com → Nouveau projet
   « Alerte routine BL » → coller ce fichier → fuseau horaire Europe/Paris dans
   les paramètres du projet → exécuter installer() une fois et autoriser. */

const AR_DEST = 'braiseandcobiganos@gmail.com';

function verifierRecap() {
  if (GmailApp.search('from:me subject:"Réception du" newer_than:1d', 0, 1).length) return;
  GmailApp.sendEmail(AR_DEST, "ALERTE : la routine BL n'a pas envoyé son récap",
    "Aucun mail « Réception du … » depuis 24 h : le passage de la routine (mercredi et samedi à 15h) " +
    "n'a pas eu lieu ou s'est arrêté en route.\n\n" +
    "Causes les plus fréquentes :\n" +
    "- le PC était éteint : allume-le, le passage manqué se lance tout seul à l'ouverture de session ;\n" +
    "- la limite de dépense du compte Claude est atteinte (claude.ai/settings/usage) ;\n" +
    "- Google Drive pour ordinateur n'était pas lancé.\n\n" +
    "Le détail est dans le journal du PC : C:\\Users\\brais\\bl-reception.log",
    { name: 'Braise & Co — alerte routine' });
}

// Idempotent : remplace les déclencheurs existants du projet
function installer() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  [ScriptApp.WeekDay.THURSDAY, ScriptApp.WeekDay.SUNDAY].forEach(function (jour) {
    ScriptApp.newTrigger('verifierRecap').timeBased().onWeekDay(jour).atHour(8).create();
  });
}
