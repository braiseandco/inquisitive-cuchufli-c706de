/* ═══════════ Mail du matin : santé des automatisations + prix qui ont bougé ═══════════
   Tous les jours à 8h. Les contrôles de la base, des crons, du téléphone SMS Gate, de l'accès Meta
   et des tâches du PC sont faits par la fonction Supabase « sante-automatisations » ; ce script
   ajoute ce qui ne se voit que dans Gmail, puis envoie le mail.

   Installation (compte braiseandcobiganos) : script.google.com → Nouveau projet
   « Santé des automatisations » → coller ce fichier → fuseau Europe/Paris dans les paramètres
   → Propriétés du script : SB_SERVICE_ROLE = la clé service_role → exécuter installer() et autoriser. */

const SA_DEST = 'braiseandcobiganos@gmail.com';
const SA_URL = 'https://ugyrrnqpapeagpuocwob.supabase.co/functions/v1/sante-automatisations';

function saGmail(controles) {
  const echecs = GmailApp.search('from:apps-scripts-notifications@google.com newer_than:1d');
  controles.push({ nom: 'Scripts Google', niveau: echecs.length ? 'alerte' : 'ok',
    detail: echecs.length ? echecs.map(function (t) { return t.getFirstMessageSubject(); }).join(' ; ') : 'aucun échec signalé par Google' });

  const alertes = GmailApp.search('newer_than:1d (subject:ALERTE OR subject:ALARME) -subject:"automatisations"');
  if (alertes.length) controles.push({ nom: 'Alertes reçues en 24 h', niveau: 'alerte',
    detail: alertes.map(function (t) { return t.getFirstMessageSubject(); }).join(' ; ') });

  const recap = GmailApp.search('from:me subject:"Réception du"', 0, 1);
  const d = recap.length ? recap[0].getLastMessageDate() : null;
  controles.push({ nom: 'Routine BL et factures (PC)', niveau: d && Date.now() - d < 4 * 864e5 ? 'ok' : 'alerte',
    detail: d ? 'dernier récap ' + Utilities.formatDate(d, 'Europe/Paris', "dd/MM 'à' HH'h'mm") : 'aucun récap trouvé' });
}

const saNombre = function (n, dec) { return Number(n).toFixed(dec).replace('.', ','); };

function envoyerSante() {
  let data = { controles: [], prix: [] };
  try {
    const r = UrlFetchApp.fetch(SA_URL, { method: 'post', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + PropertiesService.getScriptProperties().getProperty('SB_SERVICE_ROLE') } });
    if (r.getResponseCode() === 200) data = JSON.parse(r.getContentText());
    else data.controles.push({ nom: 'Contrôles Supabase', niveau: 'alerte', detail: 'réponse ' + r.getResponseCode() + ' : ' + r.getContentText().slice(0, 200) });
  } catch (e) { data.controles.push({ nom: 'Contrôles Supabase', niveau: 'alerte', detail: String(e) }); }
  saGmail(data.controles);

  const ordre = { alerte: 0, rappel: 1, ok: 2 };
  const c = data.controles.sort(function (a, b) { return ordre[a.niveau] - ordre[b.niveau]; });
  const nbAlertes = c.filter(function (x) { return x.niveau === 'alerte'; }).length;
  const couleur = { alerte: '#c0392b', rappel: '#d68910', ok: '#1e8449' };
  const etiquette = { alerte: 'À REGARDER', rappel: 'RAPPEL', ok: 'OK' };

  let html = '<div style="font-family:Arial,sans-serif;font-size:14px">';
  html += '<h3 style="margin:0 0 8px">Prix qui ont bougé (7 derniers jours)</h3>';
  if (!data.prix.length) html += '<p>Aucun changement de prix.</p>';
  else {
    html += '<table cellpadding="4" style="border-collapse:collapse;font-size:13px">';
    data.prix.forEach(function (p) {
      const hausse = p.nouveau > p.ancien;
      html += '<tr style="border-bottom:1px solid #ddd"><td>' + p.fournisseur + '</td><td><b>' + p.produit + '</b>' +
        (p.cours_du_jour ? ' <i>(cours du jour)</i>' : '') + '</td><td>' + saNombre(p.ancien, 2) + ' → ' + saNombre(p.nouveau, 2) +
        ' €/' + p.unite + '</td><td style="color:' + (hausse ? '#c0392b' : '#1e8449') + '">' + (hausse ? '+' : '') + saNombre(p.pct, 1) +
        ' %</td><td>' + (p.effet > 0 ? '+' : '') + saNombre(p.effet, 2) + ' € sur la semaine</td></tr>';
    });
    html += '</table>';
  }
  html += '<h3 style="margin:16px 0 8px">Automatisations</h3><table cellpadding="4" style="border-collapse:collapse;font-size:13px">';
  c.forEach(function (x) {
    html += '<tr style="border-bottom:1px solid #eee"><td style="color:' + couleur[x.niveau] + ';font-weight:bold">' + etiquette[x.niveau] +
      '</td><td><b>' + x.nom + '</b></td><td>' + x.detail + '</td></tr>';
  });
  html += '</table></div>';

  const sujet = (nbAlertes ? 'ALERTE automatisations : ' + nbAlertes + ' à regarder' : 'Automatisations : tout tourne') +
    ' — ' + (data.prix.length ? data.prix.length + ' prix ont bougé' : 'prix stables');
  GmailApp.sendEmail(SA_DEST, sujet, 'Ouvrir ce mail en HTML.', { htmlBody: html, name: 'Braise & Co — santé' });
}

// Idempotent : remplace les déclencheurs existants du projet
function installer() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('envoyerSante').timeBased().everyDays(1).atHour(8).create();
}
