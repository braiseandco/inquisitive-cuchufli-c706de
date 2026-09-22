/* ═══════════ Photos de bons de livraison : Gmail → Drive ═══════════
   Le serveur photographie le BL papier au moment de la réception et l'envoie à
   la boîte du restaurant. Ce script range les photos dans Drive, un sous-dossier
   par jour de livraison. Claude Code, sur le PC, lit ensuite le dossier
   synchronisé et enregistre la réception dans l'appli (voir README.md).

   Installation : script.google.com → Nouveau projet → coller ce fichier →
   lancer installerDeclencheur() une fois. */

const BL_REQUETE  = 'has:attachment subject:BL newer_than:14d';
const BL_LABEL    = 'BL rangé';
const BL_RACINE   = 'BL';
const BL_TYPES_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

function rangerLesBl() {
  const label = GmailApp.getUserLabelByName(BL_LABEL) || GmailApp.createLabel(BL_LABEL);
  let rangees = 0;

  GmailApp.search(BL_REQUETE, 0, 50).forEach(function (fil) {
    let posees = 0;
    fil.getMessages().forEach(function (msg) {
      msg.getAttachments().forEach(function (pj, i) {
        if (BL_TYPES_OK.indexOf(pj.getContentType()) === -1) return;
        const dossier = blDossierDuJour(msg.getDate());
        const nom = blNomFichier(msg, pj, i);
        // Le nom porte l'identifiant du mail : relancer le script ne crée jamais
        // de doublon, et on peut toujours remonter du fichier au mail d'origine.
        if (dossier.getFilesByName(nom).hasNext()) return;
        dossier.createFile(pj.copyBlob()).setName(nom);
        posees++;
      });
    });
    if (posees) { fil.addLabel(label); rangees += posees; }
  });

  console.log(rangees + ' photo(s) rangée(s)');
}

// « BL / 2026-09-22 » — la date du mail, donc celle de la réception
function blDossierDuJour(date) {
  const jour = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return blSousDossier(blSousDossier(DriveApp.getRootFolder(), BL_RACINE), jour);
}

function blSousDossier(parent, nom) {
  const trouve = parent.getFoldersByName(nom);
  return trouve.hasNext() ? trouve.next() : parent.createFolder(nom);
}

function blNomFichier(msg, pj, i) {
  const h = Utilities.formatDate(msg.getDate(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm');
  const ext = pj.getName().split('.').pop().toLowerCase();
  return h + '_' + msg.getId() + (i ? '_' + i : '') + '.' + ext;
}

// Toutes les 15 minutes : une livraison photographiée à 7 h est rangée avant 7 h 15.
function installerDeclencheur() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rangerLesBl') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('rangerLesBl').timeBased().everyMinutes(15).create();
  console.log('Déclencheur installé — toutes les 15 minutes.');
}
