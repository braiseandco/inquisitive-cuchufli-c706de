/* ═══════════ Photos de bons de livraison → Drive ═══════════
   Deux sources, un seul dossier d'arrivée.

   1. Le bouton « Photographier le BL » de l'appli dépose la photo dans le
      stockage Supabase. recupererPhotosAppli() la recopie dans Drive.
   2. Une photo envoyée par mail à la boîte du restaurant : rangerLesBl() la
      récupère depuis Gmail.

   Tout atterrit dans Drive / BL / AAAA-MM-JJ. Le PC lit ensuite ce dossier comme
   n'importe quel dossier local : la session qui enregistre la réception n'a
   aucune clé à manipuler, aucun téléchargement à faire. C'est voulu — elle
   tourne sans personne devant elle.

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
  return blDossier(Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd'));
}
function blRacine() { return blSousDossier(DriveApp.getRootFolder(), BL_RACINE); }
function blDossier(jour) { return blSousDossier(blRacine(), jour); }

function blSousDossier(parent, nom) {
  const trouve = parent.getFoldersByName(nom);
  return trouve.hasNext() ? trouve.next() : parent.createFolder(nom);
}

function blNomFichier(msg, pj, i) {
  const h = Utilities.formatDate(msg.getDate(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm');
  const ext = pj.getName().split('.').pop().toLowerCase();
  return h + '_' + msg.getId() + (i ? '_' + i : '') + '.' + ext;
}

/* ─── Photos prises depuis l'appli ─── */

const BL_SB_URL = 'https://ugyrrnqpapeagpuocwob.supabase.co';
// Clé publique de l'appli : déjà servie en clair dans boissons/index.html sur
// app.braiseandco.fr. Rien de confidentiel, et elle reste côté Google.
const BL_SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVneXJybnFwYXBlYWdwdW9jd29iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5OTU0OTAsImV4cCI6MjA4ODU3MTQ5MH0.QNK7DQM0UZTiA3jxN-Z7k58u64LrTU1dOK1oZlKH0Go';

function recupererPhotosAppli() {
  const entetes = { apikey: BL_SB_KEY, Authorization: 'Bearer ' + BL_SB_KEY };
  const liste = UrlFetchApp.fetch(
    BL_SB_URL + '/rest/v1/cmd_bl_photos?select=path,created_at&order=created_at.desc&limit=100',
    { headers: entetes, muteHttpExceptions: true });
  if (liste.getResponseCode() !== 200) {
    console.log('Liste des photos indisponible (' + liste.getResponseCode() + ')');
    return 0;
  }

  let copiees = 0;
  JSON.parse(liste.getContentText()).forEach(function (ph) {
    if (!ph.path) return;
    const bouts = ph.path.split('/');
    const nom = bouts[bouts.length - 1];
    const jour = bouts.length >= 2 ? bouts[bouts.length - 2]
      : Utilities.formatDate(new Date(ph.created_at), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const dossier = blDossier(jour);
    // Déjà là, ou déjà traitée et rangée : on ne la ramène pas une seconde fois.
    if (dossier.getFilesByName(nom).hasNext()) return;
    if (blSousDossier(blRacine(), 'traités').getFilesByName(nom).hasNext()) return;

    const fichier = UrlFetchApp.fetch(
      BL_SB_URL + '/storage/v1/object/authenticated/factures/' + encodeURI(ph.path),
      { headers: entetes, muteHttpExceptions: true });
    if (fichier.getResponseCode() !== 200) {
      console.log('Photo illisible : ' + ph.path + ' (' + fichier.getResponseCode() + ')');
      return;
    }
    dossier.createFile(fichier.getBlob()).setName(nom);
    copiees++;
  });

  console.log(copiees + ' photo(s) de l\'appli recopiée(s)');
  return copiees;
}

// Le déclencheur appelle celle-ci : les deux sources, dans la foulée.
function rangerTout() {
  recupererPhotosAppli();
  rangerLesBl();
}

// Toutes les 15 minutes : une livraison photographiée à 7 h est dans Drive avant 7 h 15.
function installerDeclencheur() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['rangerLesBl', 'rangerTout'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('rangerTout').timeBased().everyMinutes(15).create();
  console.log('Déclencheur installé — toutes les 15 minutes.');
}
