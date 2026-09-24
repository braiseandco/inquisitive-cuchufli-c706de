/* ═══════════ Envoi des commandes fournisseurs par mail ═══════════
   Avant, l'appli ouvrait l'appli mail du téléphone et marquait la commande
   « envoyée » sans savoir si le mail partait : le 23/09/2026, la commande DS est
   restée coincée plus de 24 h sur le téléphone. Ici, c'est la boîte du restaurant
   qui envoie, et la commande ne passe en « envoyée » que si Gmail a accepté le mail.

   Les destinataires sont lus dans la base, jamais dans la requête : ce script ne
   peut écrire qu'aux fournisseurs enregistrés.

   Installation (compte braiseandcobiganos) : script.google.com → Nouveau projet →
   coller ce fichier → Déployer → Nouveau déploiement → Application Web,
   exécuter en tant que « Moi », accès « Tout le monde » → copier l'URL /exec
   dans CUI_MAIL_URL (boissons/cuisine.js). */

const CM_SB_URL = 'https://ugyrrnqpapeagpuocwob.supabase.co';
// Clé publique de l'appli ; remplacée par la clé service dès qu'elle est posée
// dans les propriétés du script (bascule sécurité)
const CM_SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVneXJybnFwYXBlYWdwdW9jd29iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5OTU0OTAsImV4cCI6MjA4ODU3MTQ5MH0.QNK7DQM0UZTiA3jxN-Z7k58u64LrTU1dOK1oZlKH0Go';
const CM_RESTO = 'braiseandcobiganos@gmail.com';
const CM_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const CM_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function doPost(e) {
  let id = '', essai = false;
  try {
    const req = JSON.parse(e.postData.contents);
    id = req.id; essai = !!req.essai;
    if (!id) return cmRep({ ok: false, error: 'id manquant' });
    const o = cmSb('cmd_commandes?id=eq.' + encodeURIComponent(id) + '&select=*,lignes:cmd_commande_lignes(*),f:cmd_fournisseurs(*)')[0];
    if (!o) return cmRep({ ok: false, error: 'Commande introuvable' });
    const s = o.f;
    if (!s.email) return cmRep({ ok: false, error: "Pas d'e-mail pour ce fournisseur" });
    if (!o.lignes.length || !o.numero || !o.date_livraison) return cmRep({ ok: false, error: 'Commande incomplète (lignes, numéro ou date)' });

    const cc = essai ? '' : [CM_RESTO, s.email_cc].filter(Boolean).join(',');
    GmailApp.sendEmail(essai ? CM_RESTO : s.email, (essai ? '[ESSAI] ' : '') + 'Commande Braise & Co ' + o.numero + ' — livraison ' + cmJour(o.date_livraison), cmTexte(o, s), { cc: cc, name: 'Braise & Co Biganos' });
    if (essai) return cmRep({ ok: true, essai: true });

    const now = new Date().toISOString();
    const patch = { mail_envoye_le: now, mail_erreur: null, updated_at: now };
    if (o.statut === 'brouillon') { patch.statut = 'envoyee'; patch.date_commande = now; }
    const row = cmSb('cmd_commandes?id=eq.' + o.id, 'patch', patch)[0];
    return cmRep({ ok: true, commande: row });
  } catch (err) {
    const msg = String(err && err.message || err).slice(0, 500);
    if (id && !essai) { try { cmSb('cmd_commandes?id=eq.' + encodeURIComponent(id), 'patch', { mail_erreur: msg }); } catch (e2) {} }
    return cmRep({ ok: false, error: msg });
  }
}

function cmTexte(o, s) {
  const lignes = o.lignes.slice().sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); }).map(function (l) {
    return '• ' + String(Math.round(l.quantite * 100) / 100).replace('.', ',') + ' ' + (l.unite || '') + ' — ' + l.nom + (l.reference ? ' (réf. ' + l.reference + ')' : '');
  }).join('\n');
  return 'Bonjour,\n\nCommande Braise & Co Biganos' + (s.numero_client ? ' (client ' + s.numero_client + ')' : '') +
    '\nN° ' + o.numero + ' — livraison souhaitée le ' + cmJour(o.date_livraison) + '\n\n' + lignes + '\n' +
    (o.note ? '\nNote : ' + o.note + '\n' : '') + '\nMerci,\n' + (o.commande_par || '') + ' — Braise & Co\n174 av. de la Côte d\'Argent, 33380 Biganos';
}

function cmJour(iso) {
  const p = iso.split('-').map(Number); const d = new Date(p[0], p[1] - 1, p[2]);
  return CM_JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + CM_MOIS[d.getMonth()];
}

function cmSb(path, method, body) {
  const key = PropertiesService.getScriptProperties().getProperty('SB_SERVICE_ROLE') || CM_SB_ANON;
  const opts = { method: method || 'get', muteHttpExceptions: true, contentType: 'application/json',
    headers: { apikey: key, Authorization: 'Bearer ' + key, Prefer: 'return=representation' } };
  if (body) opts.payload = JSON.stringify(body);
  const r = UrlFetchApp.fetch(CM_SB_URL + '/rest/v1/' + path, opts);
  if (r.getResponseCode() >= 300) throw new Error('Supabase ' + r.getResponseCode() + ' : ' + r.getContentText());
  return JSON.parse(r.getContentText() || '[]');
}

function cmRep(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// À lancer une fois depuis l'éditeur : autorise Gmail + UrlFetch et envoie un essai à la boîte du restaurant
function essai() {
  const o = cmSb('cmd_commandes?statut=neq.brouillon&numero=like.BC*&select=id&order=date_commande.desc&limit=1')[0];
  Logger.log(doPost({ postData: { contents: JSON.stringify({ id: o.id, essai: true }) } }).getContent());
}
