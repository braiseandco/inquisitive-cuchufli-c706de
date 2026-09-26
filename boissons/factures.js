/* ═══════════════ FACTURES — contrôle facture ↔ commande ↔ réception ═══════════════
   Espace patron (appui long sur le logo). Les PDF arrivent dans le bucket Supabase "factures"
   via l'Apps Script d'import ; ici on les lit dans le navigateur (pdf.js, gratuit), on en
   extrait les lignes selon le format de chaque fournisseur, puis on les rapproche des
   commandes et réceptions saisies dans l'onglet Cuisine. S'appuie sur cuisine.js (CUI, cui*). */

const FAC = { rows: [], filtre: 'a_controler', loaded: false };
const FAC_STATUTS = { a_controler: 'À contrôler', validee: 'Validée', contestee: 'Contestée', payee: 'Payée', historique: 'Historique', document: 'Document' };
// historique : factures antérieures au 25/09/2026, jamais contrôlées et laissées telles quelles (comptées dans le récap)
const FAC_EST_FACTURE = f => !f.type || f.type === 'facture' || f.type === 'avoir';
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ─── Utilitaires ─── */
const facNum = s => { if (s == null) return null; s = String(s).replace(/\s| |€/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? null : n; };
const facDate = s => { const m = /(\d\d)[\/.](\d\d)[\/.](\d{4}|\d{2})\b/.exec(s || ''); return m ? `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2]}-${m[1]}` : null; };
const facD = d => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
// Unités des factures → unités de l'appli, pour savoir si on peut comparer quantités et prix
const FAC_UNITES = { KG: 'kilo', K: 'kilo', KILO: 'kilo', L: 'litre', PI: 'pièce', P: 'pièce', U: 'pièce', PC: 'pièce', PIECE: 'pièce', 'PIÈCE': 'pièce', BT: 'boîte', CT: 'carton', CO: 'carton', BD: 'bidon', SH: 'sachet', SA: 'sachet', SO: 'seau', LO: 'lot', COLIS: 'colis', FUT: 'fût', CAISSE: 'caisse', CARTON: 'carton', BIB: 'bib', BTL: 'bouteille', BIB: 'bib', BOITE: 'boîte', TUBE: 'tube' };
function facUniteApp(u) { u = (u || '').toLowerCase().replace(/\(s\)|s$/g, '').trim(); return { kilo: 'kilo', kg: 'kilo', litre: 'litre', 'pièce': 'pièce', piece: 'pièce', 'unité': 'pièce', 'boîte': 'boîte', boite: 'boîte', bouteille: 'bouteille', carton: 'carton', 'pack de 12': 'carton', 'pack de 6': 'carton', 'pack de 24': 'carton', bidon: 'bidon', 'fût': 'fût', fut: 'fût', bib: 'bib', tube: 'tube', sachet: 'sachet', sac: 'sachet', seau: 'seau', lot: 'lot', colis: 'colis', plateau: 'plateau', barquette: 'barquette', filet: 'filet', poche: 'poche', bac: 'pièce' }[u] || u; }
// DS Restauration facture au kilo des produits qu'on commande au colis (haricots verts, tender :
// poche de 2,5 kg). poids_kg donne le poids d'une unité de l'appli : de quoi ramener les quantités
// et les prix du fournisseur à la poche. Renvoie le poids quand la conversion s'applique, sinon null.
function facConvPoids(p, unite) {
  const poids = p && p.poids_kg != null ? Number(p.poids_kg) : 0;
  if (!poids || !p.unite) return null;
  return (FAC_UNITES[(unite || '').toUpperCase()] === 'kilo' && facUniteApp(p.unite) !== 'kilo') ? poids : null;
}
const facNorm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/* ─── Chargement ─── */
async function facLoad() {
  try {
    FAC.rows = await cuiGET('cmd_factures?order=date_facture.desc.nullslast,created_at.desc&limit=300');
    FAC.loaded = true;
  } catch (e) { console.error(e); cuiToast('Factures : erreur de connexion'); }
}
function facSup(id) { return CUI.sups.find(s => s.id === id); }

/* ─── Espace patron (appui long sur le logo) ─── */
async function cuiOpenPatron(deverrouille) {
  if (!CUI.loaded) await cuiLoad(true);
  if (!deverrouille && !facPatronOuvert()) return facDemanderPin();
  if (!FAC.loaded) await facLoad();
  facAutoLire();
  const n = FAC.rows.filter(f => f.statut === 'a_controler').length;
  const c = FAC.rows.filter(f => f.statut === 'contestee').length;
  cuiModal('Espace patron', `
    <div class="modal-actions">
      <button class="btn-primary" onclick="cuiCloseModal();facShow()">🧾 Factures${n ? ` · ${n} à contrôler` : ''}${c ? ` · ${c} contestée${c > 1 ? 's' : ''}` : ''}</button>
      <button class="btn-secondary" onclick="cuiOpenRecap()">📊 Récap des achats</button>
      <button class="btn-secondary" onclick="cuiCloseModal();switchTab('historique')">🍺 Historique bar</button>
      <button class="btn-close" onclick="facChangerPin()">Changer le code</button>
      <button class="btn-close" onclick="cuiCloseModal()">Fermer</button>
    </div>`);
}

/* ─── Code PIN de l'espace patron (partagé entre tablettes via cmd_parametres, 30 min de validité) ─── */
function facPatronOuvert() { try { return Date.now() - (+sessionStorage.getItem('cui_patron_ok') || 0) < 30 * 60e3; } catch (e) { return false; } }
async function facSha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('braise:' + s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function facDemanderPin() {
  let hash = null;
  try { const r = await cuiGET('cmd_parametres?cle=eq.pin_patron&select=valeur'); hash = r.length ? r[0].valeur : null; } catch (e) { cuiToast('Connexion impossible'); return; }
  const creation = !hash;
  cuiModal(creation ? 'Créer le code patron' : 'Espace patron', `
    <div class="prod-meta" style="margin-bottom:10px">${creation ? 'Premier accès : choisissez un code à 4 chiffres. Il sera demandé sur toutes les tablettes pour ouvrir les factures et le récap des achats.' : 'Code à 4 chiffres.'}</div>
    <div style="text-align:center;font-size:32px;letter-spacing:14px;min-height:44px;padding:4px 0 10px" id="cui-pin-aff">····</div>
    ${creation ? '<div class="prod-meta" style="text-align:center" id="cui-pin-etape">Saisissez le code</div>' : ''}
    <div style="display:grid;grid-template-columns:repeat(3,72px);gap:10px;justify-content:center;margin:6px 0 12px">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button class="cui-chip" style="height:56px;font-size:22px;justify-content:center" onclick="facPinTouche('${k}')">${k}</button>`).join('')}
    </div>
    <div class="modal-actions"><button class="btn-close" onclick="cuiCloseModal()">Annuler</button></div>`);
  FAC._pin = { saisie: '', hash, creation, premier: null };
}
async function facPinTouche(k) {
  const p = FAC._pin; if (!p) return;
  if (k === '⌫') p.saisie = p.saisie.slice(0, -1); else if (p.saisie.length < 4) p.saisie += k;
  cui$('cui-pin-aff').textContent = (p.saisie.replace(/./g, '●') + '····').slice(0, 4);
  if (p.saisie.length < 4) return;
  const h = await facSha(p.saisie);
  if (p.creation) {
    if (!p.premier) { p.premier = h; p.saisie = ''; cui$('cui-pin-aff').textContent = '····'; cui$('cui-pin-etape').textContent = 'Confirmez le code'; return; }
    if (h !== p.premier) { p.premier = null; p.saisie = ''; cui$('cui-pin-aff').textContent = '····'; cui$('cui-pin-etape').textContent = 'Les deux codes diffèrent, recommencez'; return; }
    try { await cuiPOST('cmd_parametres', { cle: 'pin_patron', valeur: h }); } catch (e) { cuiToast('Erreur'); return; }
    cuiToast('Code enregistré');
  } else if (h !== p.hash) { p.saisie = ''; cui$('cui-pin-aff').textContent = '····'; cuiToast('Code incorrect'); return; }
  try { sessionStorage.setItem('cui_patron_ok', String(Date.now())); } catch (e) {}
  FAC._pin = null; cuiOpenPatron(true);
}
async function facChangerPin() {
  if (!facPatronOuvert()) return;
  try { await cuiDEL('cmd_parametres?cle=eq.pin_patron'); } catch (e) { cuiToast('Erreur'); return; }
  facDemanderPin();
}

/* ─── Liste ─── */
async function facShow() {
  switchTab('cuisine');
  if (!FAC.loaded) await facLoad();
  cui$('cui-home').classList.add('hidden'); cui$('cui-sup').classList.add('hidden'); cui$('cui-hist').classList.add('hidden');
  cui$('cui-fact').classList.remove('hidden');
  CUI.supId = null; cuiRenderBar(); facRender();
}
function facHide() { cui$('cui-fact').classList.add('hidden'); cuiShowHome(); }
function facSetFiltre(k) { FAC.filtre = k; facRender(); }
function facRender() {
  const counts = {}; FAC.rows.forEach(f => { const k = FAC_EST_FACTURE(f) ? f.statut : 'documents'; counts[k] = (counts[k] || 0) + 1; });
  const chips = [['a_controler', 'À contrôler'], ['contestee', 'Contestées'], ['validee', 'Validées'], ['payee', 'Payées'], ['historique', 'Historique'], ['all', 'Toutes'], ['documents', 'BL & confirmations']];
  cui$('cui-fact-chips').innerHTML = chips.map(([k, l]) => `<button class="cui-chip ${FAC.filtre === k ? 'on' : ''}" onclick="facSetFiltre('${k}')">${l}${k !== 'all' && counts[k] ? ' · ' + counts[k] : ''}</button>`).join('');
  const list = FAC.rows.filter(f => FAC.filtre === 'documents' ? !FAC_EST_FACTURE(f) : FAC_EST_FACTURE(f) && (FAC.filtre === 'all' || f.statut === FAC.filtre));
  const nonLues = FAC.rows.filter(f => f.pdf_path && !f.lignes_json).length;
  cui$('cui-fact-list').innerHTML = (nonLues ? `<button class="cui-chip" style="margin:6px 0 10px" onclick="facAnalyserTout()">📖 Lire les ${nonLues} PDF non lus</button>` : '') + list.map(f => {
    const s = facSup(f.fournisseur_id) || {};
    const r = f.ecarts_json || {};
    if (!FAC_EST_FACTURE(f)) {
      const o = r.commande ? CUI.orders.find(x => x.id === r.commande) : null;
      const lib = { bl_rattache: o ? `BL posé sur la commande ${cuiEsc(cuiNumAff(o))}` : 'BL rattaché', confirmee: o ? `commande ${cuiEsc(cuiNumAff(o))} confirmée` : 'commande confirmée', commande_creee: o ? `commande ${cuiEsc(cuiNumAff(o))} créée (hors appli)` : 'commande créée', sans_lignes: '<span style="color:var(--warn)">lignes non lues</span>' }[r.action] || (f.lignes_json ? 'lu' : 'non lu');
      return `<div class="hist-item cui-order-row" onclick="${o ? `cuiOpenOrder('${o.id}')` : `facVoirPdf('${f.id}')`}">
        <div class="hist-date">${facD(f.date_facture)} · ${DOC_TYPES[f.type] || f.type}</div>
        <div class="hist-summary">${s.emoji || '📄'} ${cuiEsc(s.nom || 'Fournisseur ?')} <span style="float:right;color:var(--muted);font-size:12px">n° ${cuiEsc(f.numero || '—')}</span></div>
        <div class="hist-detail">${lib}</div>
      </div>`;
    }
    const avoir = f.type === 'avoir' || (f.lignes_json && f.lignes_json.avoir);
    return `<div class="hist-item cui-order-row" onclick="facOpen('${f.id}')">
      <div class="hist-date">${facD(f.date_facture)}${f.date_echeance ? ' · échéance ' + facD(f.date_echeance) : ''}${f.envoye_comptable_at ? ' · comptable ✓' : ''}</div>
      <div class="hist-summary">${avoir ? '↩' : s.emoji || '📄'} ${cuiEsc(s.nom || 'Fournisseur ?')}${avoir ? ' <span class="cui-status livree">Avoir</span>' : ''} <span class="cui-status ${f.statut === 'validee' || f.statut === 'payee' ? 'livree' : f.statut === 'contestee' ? 'annulee' : 'envoyee'}">${FAC_STATUTS[f.statut] || f.statut}</span><span style="float:right;color:var(--orange)">${f.montant_ttc != null ? cuiEur(f.montant_ttc) + ' TTC' : ''}</span></div>
      <div class="hist-detail">n° ${cuiEsc(f.numero || '—')}${f.montant_ht != null ? ' · ' + cuiEur(f.montant_ht) + ' HT' : ''}${facLectureIncomplete(f) != null ? ' · <span style="color:var(--warn)">⚠️ lecture incomplète</span>' : r.nb_ecarts ? ` · <span style="color:var(--danger)">⚠️ ${r.nb_ecarts} écart${r.nb_ecarts > 1 ? 's' : ''}</span>` : r.nb_lignes ? ' · <span style="color:var(--ok)">✓ ' + r.nb_lignes + ' lignes</span>' : f.pdf_path ? ' · PDF non lu' : ' · saisie manuelle'}</div>
    </div>`;
  }).join('') || '<div class="empty-state">Aucune facture.</div>';
}
// Les lignes et les frais lus doivent retomber sur le total HT : au-delà de 5 centimes d'arrondi, le lecteur a
// manqué quelque chose. Renvoie alors le montant lu.
function facLectureIncomplete(f) {
  const lj = f.lignes_json, lg = lj && lj.lignes;
  if (!lg || !lg.length || f.montant_ht == null) return null;
  const lu = Math.round((lg.reduce((a, l) => a + (Number(l.montant) || 0), 0) + (Number(lj.frais) || 0)) * 100) / 100;
  return Math.abs(Number(f.montant_ht) - lu) > 0.05 ? lu : null;
}

/* ─── Lecture du PDF (pdf.js) ─── */
function facLoadPdfjs() {
  if (window.pdfjsLib) return Promise.resolve();
  return new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = PDFJS_URL;
    s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; ok(); };
    s.onerror = () => ko(new Error('pdf.js introuvable'));
    document.head.appendChild(s);
  });
}
async function facFetchPdf(path) {
  const r = await fetch(SB_URL + '/storage/v1/object/authenticated/factures/' + path, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
  if (!r.ok) throw new Error('PDF introuvable (' + r.status + ')');
  return r.arrayBuffer();
}
// Une facture peut arriver en plusieurs PDF, une page par fichier (pdf_suite, posé par le script d'import) : on lit tout à la suite
const facFichiers = f => [f.pdf_path, ...(f.pdf_suite || [])];
async function facLignesDoc(f) {
  let L = [];
  for (const p of facFichiers(f)) L = L.concat(await facPdfLines(await facFetchPdf(p)));
  return L;
}
// Reconstitue les lignes de texte du PDF (pdf.js rend des fragments positionnés)
async function facPdfLines(buf) {
  await facLoadPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ x: i.transform[4], y: i.transform[5], s: i.str }));
    items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    let cur = null;
    items.forEach(i => {
      if (!cur || Math.abs(cur.y - i.y) > 3) { cur = { y: i.y, parts: [] }; lines.push(cur); }
      cur.parts.push(i);
    });
    lines.push({ y: -1, parts: [{ x: 0, s: '\f' }] });
  }
  return lines.map(l => l.parts.sort((a, b) => a.x - b.x).map(p => p.s).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/* ─── Parseurs : un par format de facture ───
   Résultat : { bls:[{numero,date}], lignes:[{bl,ref,nom,qte,unite,pu,montant}], numero, date, echeance, ht, tva, ttc, frais }
   frais : ce que le HT compte en plus des lignes (frais administratifs, transport, logistique, taxes interprofessionnelles) */
const FAC_PARSEURS = {
  lodifrais(L) {
    const r = { bls: [], lignes: [] }; let bl = null;
    L.forEach((t, i) => {
      let m;
      if ((m = /Num.{1,2}ro\s*:\s*F?(\d+)|Facture n.{1,2}:\s*F?(\d+)/.exec(t))) r.numero = r.numero || m[1] || m[2];
      if ((m = /Date\s*:\s*(\d\d\/\d\d\/\d{4})/.exec(t)) && !r.date) r.date = facDate(m[1]);
      if ((m = /BL N.{1,2}\s*(\w+) du (\d\d\/\d\d\/\d{4})/.exec(t))) { bl = m[1]; r.bls.push({ numero: bl, date: facDate(m[2]) }); }
      if ((m = /PRELEVEMENTS\s+(\d\d\/\d\d\/\d{4})/.exec(t))) r.echeance = facDate(m[1]);
      if ((m = /Net .{1,2} payer\s*:\s*(\d{1,3}(?:\s?\d{3})*[.,]\d{2})/.exec(t))) r.ttc = facNum(m[1]);
      if ((m = /^([\d\s]+\.\d{2}) ([\d\s]+\.\d{2}) ([\d\s]+\.\d{2})$/.exec(t))) { r.ht = facNum(m[1]); r.tva = facNum(m[2]); }
      if ((m = /FA:(\d+\.\d{2})/.exec(t))) r.frais = facNum(m[1]);
      // La désignation passe parfois sous les chiffres, sur la ligne suivante (mayonnaise, facture 73166690)
      if ((m = /^(?:[A-Z]\s+)?(\d{5,6})\s*(.*?)\s+(\d+(?:\.\d+)?)\s*([A-Z]{1,3})\s+(\d+\.\d{3})\s+(\d+\.\d{2})\s+\d{2}$/.exec(t)))
        r.lignes.push({ bl, ref: m[1], nom: m[2].trim() || L[i + 1] || '', qte: facNum(m[3]), unite: m[4], pu: facNum(m[5]), montant: facNum(m[6]) });
    });
    return r;
  },
  ds(L) {
    const r = { bls: [], lignes: [] }; let bl = null;
    L.forEach(t => {
      let m;
      if ((m = /N[°º] Facture\s*:\s*(\d+)/.exec(t))) r.numero = r.numero || m[1];
      if ((m = /Date\s*:\s*(\d\d\/\d\d\/\d{4})/.exec(t)) && !r.date) r.date = facDate(m[1]);
      if ((m = /BL\s*:\s*(\d+) du (\d\d\/\d\d\/\d{4})/.exec(t))) { bl = m[1]; r.bls.push({ numero: bl, date: facDate(m[2]) }); }
      if ((m = /plus tard le\s*:?\s*(\d\d\/\d\d\/\d{4})/.exec(t))) r.echeance = facDate(m[1]);
      if ((m = /^\d\s+[\d.,]+%\s+([\d\s.,]+?)\s+([\d\s.,]+)$/.exec(t)) && !r.ht) { r.ht = facNum(m[1]); r.tva = facNum(m[2]); }
      if ((m = /^(\d{1,3}(?:\s?\d{3})*[.,]\d{2})\s*€$/.exec(t)) && r.ttc == null) r.ttc = facNum(m[1]);
      if ((m = /^[A-Z]\s+[A-Z]\s+(\d{5})\s+(.+?)\s+[A-Z]{2,3}\s+([A-Z]{2})\s+(\d+(?:[.,]\d+)?)\s+(\d+[.,]\d{2})\s+(\d+[.,]\d{2})\s+\d$/.exec(t)))
        r.lignes.push({ bl, ref: m[1], nom: m[2].trim(), qte: facNum(m[4]), unite: m[3], pu: facNum(m[5]), montant: facNum(m[6]) });
    });
    return r;
  },
  jardins(L) {
    const r = { bls: [], lignes: [] }; let bl = null, tot = 0;
    L.forEach(t => {
      let m;
      if ((m = /(REL\d+) (\d\d\/\d\d\/\d{4})/.exec(t))) { r.numero = r.numero || m[1]; r.date = r.date || facDate(m[2]); }
      if ((m = /^Facture (FC\/\d+\/\d+)/.exec(t)) && !/REL/.test(r.numero || '')) r.numero = r.numero || m[1];
      if ((m = /BL(\d+) (\d\d\/\d\d\/\d{4})/.exec(t))) { bl = m[1]; r.bls.push({ numero: bl, date: facDate(m[2]) }); r.date = r.date || facDate(m[2]); }
      if ((m = /Total HT ([\d\s]+,\d{2}) €/.exec(t)) && tot === 0) { r.ht = facNum(m[1]); tot = 1; }
      if ((m = /^Taxes ([\d\s]+,\d{2}) €/.exec(t)) && tot === 1) { r.tva = facNum(m[1]); tot = 2; }
      if ((m = /Total TTC ([\d\s]+,\d{2}) €/.exec(t)) && tot === 2) { r.ttc = facNum(m[1]); tot = 3; }
      if ((m = /^(.+?)\s+(Net|Pi[èe]ce)\s+(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?))?\s+(\d+,\d{3})\s+(\d+,\d{2})\s*€?$/.exec(t))) {
        const net = m[2] === 'Net';
        r.lignes.push({ bl, ref: null, nom: m[1].replace(/\s*DLC \S+/, '').replace(/\s+CAT\.\d.*$/, '').trim(), qte: net ? facNum(m[4] || m[3]) : facNum(m[3]), unite: net ? 'KG' : 'PI', colis: net && m[4] ? facNum(m[3]) : null, pu: facNum(m[5]), montant: facNum(m[6]) });
      }
    });
    return r;
  },
  mericq(L) {
    const r = { bls: [], lignes: [] }; let bl = null, prev = '', code20 = null, base20 = 0; const parCode = {};
    L.forEach(t => {
      let m;
      if ((m = /^(\d{8}) (\d\d\/\d\d\/\d{4}) \d+$/.exec(t))) { r.numero = m[1]; r.date = facDate(m[2]); }
      if ((m = /Liv No (\d+) du (\d\d\/\d\d\/\d{4})/.exec(t))) { bl = m[1]; r.bls.push({ numero: bl, date: facDate(m[2]) }); }
      if ((m = /Ech[ée]ance au (\d\d\/\d\d\/\d{4})/.exec(t))) r.echeance = facDate(m[1]);
      if ((m = /Totaux ([\d\s]+,\d{2}) ?€ ([\d\s]+,\d{2}) ?€ ([\d\s]+,\d{2}) ?€/.exec(t))) { r.ht = facNum(m[1]); r.tva = facNum(m[2]); r.ttc = facNum(m[3]); }
      if ((m = /(?:^|\s)(\d) 20,00 ([\d\s]+,\d{2}) €/.exec(t))) { code20 = m[1]; base20 = facNum(m[2]); }
      if ((m = /^(.*?)\s*(\d+,\d{2})\s+K\s+(\d+,\d{2})\s+(?:NetNet\s+)?(\d+,\d{2})\s+(\d)$/.exec(t))) {
        r.lignes.push({ bl, ref: null, nom: m[1].trim() || prev, qte: facNum(m[2]), unite: 'KG', pu: facNum(m[3]), montant: facNum(m[4]) });
        parCode[m[5]] = (parCode[m[5]] || 0) + facNum(m[4]);
      } else if ((m = /^(.*?)\s*(\d+)\s+(\d+,\d{2})\s+U\s+(\d+,\d{2})\s+(?:NetNet\s+)?(\d+,\d{2})\s+(\d)$/.exec(t))) {
        r.lignes.push({ bl, ref: null, nom: m[1].trim() || prev, qte: facNum(m[2]), unite: 'PI', poids: facNum(m[3]), pu: facNum(m[4]), montant: facNum(m[5]) });
        parCode[m[6]] = (parCode[m[6]] || 0) + facNum(m[5]);
      } else if (!/^\*+|^Total|^Pour tout|^veuillez|^Nombre/.test(t)) prev = t;
    });
    // Frais (éco-énergie, forfait logistique) : base à 20 % du tableau TVA, hors lignes à 20 %. Le montant du
    // forfait manque parfois dans le texte du PDF (facture 47236610), la base TVA jamais.
    if (base20) r.frais = Math.round((base20 - (parCode[code20] || 0)) * 100) / 100;
    return r;
  },
  blason(L) {
    const r = { bls: [], lignes: [] }; let bl = null;
    L.forEach(t => {
      let m;
      if ((m = /\s(\d{8}) (\d\d\/\d\d\/\d{4})$/.exec(t)) && !r.numero) { r.numero = m[1]; r.date = facDate(m[2]); }
      if ((m = /B\.L\. (\d+) .*Livr[ée] le (\d\d\/\d\d\/\d{4})/.exec(t))) { bl = m[1]; if (!r.bls.some(b => b.numero === bl)) r.bls.push({ numero: bl, date: facDate(m[2]) }); }
      if ((m = /^(\d\d\/\d\d\/\d{4}) \d\d\/\d\d\/\d{4}$/.exec(t))) r.echeance = facDate(m[1]);
      if ((m = /^([\d\s]+,\d{2}) ([\d\s]+,\d{2}) ([\d\s]+,\d{2}) EUR$/.exec(t))) { r.ht = facNum(m[1]); r.tva = facNum(m[2]); r.ttc = facNum(m[3]); }
      // « SURCOUT TRANSPORT ET ENERGIE » : « 2,0000 Base : 227,63 4,55 »
      if ((m = /Base : [\d\s]+,\d{2} (\d+,\d{2})$/.exec(t))) r.frais = (r.frais || 0) + facNum(m[1]);
      if ((m = /^(\d{6})\s+(.+?)\s+\d+\s+[A-Z]\s+(\d+,\d{3})\s+Kg\s+(\d+,\d{4})\s*\/Kg\s+(\d+,\d{4})\s*\/Kg\s+[A-Z]\s+(\d+,\d{2})$/.exec(t)))
        r.lignes.push({ bl, ref: m[1], nom: m[2].trim(), qte: facNum(m[3]), unite: 'KG', pu: facNum(m[5]), montant: facNum(m[6]) });
    });
    return r;
  },
  lebihan(L) {
    // Facture ou AVOIR ; consignes à part. Une ligne donne la quantité commandée puis la quantité facturée :
    // « 2 FUT 60 L » (deux fûts, 60 litres, prix au litre), « 4 CAI 96 COL » (quatre caisses, 96 bouteilles).
    const r = { bls: [], lignes: [] }; let avoir = false, bl = null, livre = null, frais = 0; const taux = {};
    L.forEach(t => {
      let m;
      if ((m = /(AVOIR|FACTURE)\s+VTE-(\d+) du (\d\d\/\d\d\/\d{4})/i.exec(t))) { avoir = /avoir/i.test(m[1]); r.numero = m[2]; r.date = facDate(m[3]); r.avoir = avoir; }
      if ((m = /Date d.echeance\s*:\s*(\d\d\/\d\d\/\d{4})/.exec(t))) r.echeance = facDate(m[1]);
      if ((m = /BL DU (\d\d\/\d\d)/.exec(t)) && r.date) r.bls.push({ numero: m[1], date: r.date.slice(0, 4) + '-' + m[1].split('/').reverse().join('-') });
      if ((m = /BL ORIGINE (\d+)/.exec(t))) bl = m[1];
      // En-tête : réf. commande, téléphone, puis dates de commande, de livraison et de facture
      if ((m = /^[A-Z]\d{8} .*?\d\d\/\d\d\/\d{4} (\d\d\/\d\d\/\d{4}) \d\d\/\d\d\/\d{4}/.exec(t))) livre = facDate(m[1]);
      // Une ligne par taux de TVA (5,5 % sodas, eaux et jus, 20 % alcools) : le HT et la TVA sont leur somme
      if ((m = /^\d\s+([\d.]+) %\s+(\d{1,3}(?: \d{3})*\.\d{2})\s+(\d{1,3}(?: \d{3})*\.\d{2})/.exec(t))) taux[m[1]] = [facNum(m[2]), facNum(m[3])];
      // « Total Facturé » ajoute les consignes au TTC
      if ((m = /Total TTC (\d[\d\s]*\.\d{2}) €/.exec(t))) r.ttc = facNum(m[1]);
      // Frais de gestion : « F.G: 4.50 » en pied, et la ligne « SURCOUT TEMPORAIRE FRAIS GESTION »
      if ((m = /F\.G: (\d+\.\d{2})/.exec(t))) frais += facNum(m[1]);
      if ((m = /^(\d{6})\s+(.+?)\s+(\d+(?:\.\d+)?)\s+([A-Z]{3,})\s+(\d+(?:\.\d+)?) ?([A-Z]+)\s+(\d+\.\d{4}|GRATUIT)\s+(\d+\.\d{2})(?:\s|$)/.exec(t))) {
        const qte = facNum(m[3]), montant = facNum(m[8]), lt = m[6] === 'L' ? facNum(m[5]) : null;
        // Le tarif Le Bihan (et l'appli) sont droits + éco-taxe compris : prix recalculé à partir du montant, au litre
        // pour un fût, sinon par caisse ou carton commandé, que le rapprochement ramène à la bouteille
        if (/\bFRAIS\b/.test(m[2])) frais += montant;
        else r.lignes.push({ ref: m[1], nom: m[2].trim(), qte, unite: { CAI: 'CAISSE', CAR: 'CARTON', COL: 'BTL' }[m[4]] || m[4], cont: m[5] + ' ' + m[6], pu_hd: facNum(m[7]), pu: lt || qte ? Math.round(montant / (lt || qte) * 1000) / 1000 : null, montant, litres: lt });
      }
    });
    r.frais = Math.round(frais * 100) / 100;
    if (bl) r.bls.push({ numero: bl, date: livre || r.date });
    r.lignes.forEach(l => { l.bl = r.bls.length ? r.bls[0].numero : null; });
    // Cartons offerts (« GRATUIT ») : ajoutés à la ligne payante du même produit, puisque la réception compte le tout
    r.lignes = r.lignes.filter(l => {
      const payee = !l.montant && r.lignes.find(x => x.ref === l.ref && x.montant);
      if (payee) { payee.qte += l.qte; payee.nom += ` (dont ${l.qte} offert${l.qte > 1 ? 's' : ''})`; }
      return !payee;
    });
    const tx = Object.values(taux);
    if (tx.length) [r.ht, r.tva] = [0, 1].map(k => Math.round(tx.reduce((a, x) => a + x[k], 0) * 100) / 100);
    if (avoir) { ['ht', 'tva', 'ttc', 'frais'].forEach(k => { if (r[k] != null) r[k] = -r[k]; }); r.lignes.forEach(l => { l.montant = -l.montant; l.qte = -l.qte; }); }
    return r;
  },
  cafe(L) {
    // Café Richard : n° de facture à 10 chiffres en fin d'en-tête, dates jj/mm/aa, lignes "REF QTE DESIGNATION PU MNT T"
    const r = { bls: [], lignes: [] }; let bl = null;
    L.forEach(t => {
      let m;
      if ((m = /^\d{4} \d+ \d+ \S+ .* (\d\d\/\d\d\/\d\d) (\d{10}) L\d+$/.exec(t))) { r.date = facDate(m[1]); r.numero = m[2]; }
      if ((m = /^BL n[°º] (\d+) du (\d\d\/\d\d\/\d\d)/.exec(t))) { bl = m[1]; r.bls.push({ numero: bl, date: facDate(m[2]) }); }
      if ((m = /^Echéance:\s*(\d\d\/\d\d\/\d\d)/.exec(t))) r.echeance = facDate(m[1]);
      if ((m = /TOTAL H\.T\. ([\d\s]+,\d{2})/.exec(t))) r.ht = facNum(m[1]);
      if ((m = /TOTAL T\.V\.A\. ([\d\s]+,\d{2})/.exec(t))) r.tva = facNum(m[1]);
      if ((m = /TOTAL T\.T\.C\. ([\d\s]+,\d{2})/.exec(t))) r.ttc = facNum(m[1]);
      if ((m = /^(\d{6}) (\d+) (.+?) (\d+,\d{2}) (\d+,\d{2}) \d$/.exec(t)))
        r.lignes.push({ bl, ref: m[1], nom: m[3].trim(), qte: facNum(m[2]), unite: 'PC', pu: facNum(m[4]), montant: facNum(m[5]) });
      else if ((m = /^(\d{6}) (\d+) (.+?) (Gratuité.*|Mise à disposition)$/.exec(t)))
        r.lignes.push({ bl, ref: m[1], nom: m[3].trim() + ' (' + m[4].toLowerCase() + ')', qte: facNum(m[2]), unite: 'PC', pu: 0, montant: 0 });
    });
    return r;
  },
  cocktails(L) {
    const r = { bls: [], lignes: [] };
    L.forEach(t => {
      let m;
      if ((m = /^(F\d{8}) (\d\d\/\d\d\/\d\d) \d+ /.exec(t))) { r.numero = m[1]; r.date = facDate(m[2]); }
      if ((m = /Echéance : le (\d\d\/\d\d\/\d\d)/.exec(t))) r.echeance = facDate(m[1]);
      if ((m = /Total HT ([\d\s]+,\d{2})/.exec(t))) r.ht = facNum(m[1]);
      if ((m = /^Total TVA ([\d\s]+,\d{2})/.exec(t))) r.tva = facNum(m[1]);
      if ((m = /Total TTC ([\d\s]+,\d{2})/.exec(t))) r.ttc = facNum(m[1]);
      if ((m = /^([A-Z]{2}\d{2,3}) (.+?) (\d+) (\d+,\d{2}) ([\d\s]+,\d{2}) V\d+$/.exec(t)))
        r.lignes.push({ bl: null, ref: m[1], nom: m[2].trim(), qte: facNum(m[3]), unite: 'PC', pu: facNum(m[4]), montant: facNum(m[5]) });
    });
    return r;
  },
  platins(L) {
    // SAS des Platins : "PRODUCTEUR — VIN … • Bouteille 75.0 cl", le libellé peut déborder sur la ligne suivante
    const r = { bls: [], lignes: [] };
    L.forEach(t => {
      let m;
      if ((m = /^FACTURE (\d{4}-\d{2}-\d{4})/.exec(t))) r.numero = m[1];
      if ((m = /^(\d\d\/\d\d\/\d{4}) (\d\d\/\d\d\/\d{4}) (\d+) /.exec(t))) { r.date = facDate(m[1]); r.echeance = facDate(m[2]); r.bls.push({ numero: m[3], date: r.date }); }
      if ((m = /Total HT ([\d\s]+,\d{2})$/.exec(t))) r.ht = facNum(m[1]);
      if ((m = /^Total TVA ([\d\s]+,\d{2})/.exec(t))) r.tva = facNum(m[1]);
      if ((m = /Total TTC ([\d\s]+,\d{2}) €/.exec(t))) r.ttc = facNum(m[1]);
      if ((m = /^(.+?) (\d+) \d+,\d % (\d+,\d{2}) ([\d\s]+,\d{2})$/.exec(t))) {
        let nom = m[1].replace(/\s*•.*$/, '').trim(); if (nom.includes(' — ')) nom = nom.split(' — ').pop();
        r.lignes.push({ bl: r.bls[0] ? r.bls[0].numero : null, ref: null, nom: nom.replace(/\s+(CRD|FR-BIO-01|Bio¹?)\b/g, '').trim(), qte: facNum(m[2]), unite: /Bib/i.test(t) ? 'BIB' : 'BTL', pu: facNum(m[3]), montant: facNum(m[4]) });
      }
    });
    return r;
  },
  carniato(L) {
    // Carniato : quantités en cartons × bouteilles, prix à la bouteille, droits d'accises en plus
    const r = { bls: [], lignes: [] }; let bl = null;
    L.forEach(t => {
      let m;
      if ((m = /^(\d{9}) (\d+) (\d\d\.\d\d\.\d{4}) /.exec(t))) { r.numero = m[1]; r.date = facDate(m[3]); }
      if ((m = /^BL N[°º](\d+) du (\d\d\.\d\d\.\d{4})/.exec(t))) { bl = m[1]; r.bls.push({ numero: bl, date: facDate(m[2]) }); }
      if ((m = /^(\d{5}) (?:\d{2})?(.+?) (\d,\d{2}) (\d+) (\d+) (\d+,\d{2}) .*? (\d+) (\d+,\d{2}) A\d ([\d\s]+,\d{2}) /.exec(t)))
        r.lignes.push({ bl, ref: m[1], nom: m[2].trim() + ' ' + m[3] + ' L', qte: facNum(m[7]), unite: 'BTL', cartons: facNum(m[4]), parCarton: facNum(m[5]), pu: facNum(m[8]), montant: facNum(m[9]) });
      // Frais : participation au transport, et les frais au poids et « frais fixes », qui n'apparaissent que dans
      // la ligne « A3 » (services) de la ventilation des ventes
      if ((m = /^PARTICIPATION AU TRANSPORT (\d+,\d{2})/.exec(t))) r.frais = r.frais || facNum(m[1]);
      if ((m = /^A3 ([\d\s]+,\d{2}) /.exec(t))) r.frais = facNum(m[1]);
      if ((m = /CALCUL T\.V\.A\. TOTAL ([\d\s]+,\d{2})$/.exec(t))) r.ht = facNum(m[1]);
      if ((m = / TOTAL ([\d\s]+,\d{2})$/.exec(t)) && /^A\d /.test(t)) r.tva = facNum(m[1]);
      if ((m = /^TOTAL T\.T\.C\. ([\d\s]+,\d{2})/.exec(t))) r.ttc = facNum(m[1]);
    });
    return r;
  },
  yesfood(L) {
    const r = { bls: [], lignes: [] }; let bl = null;
    L.forEach(t => {
      let m;
      if ((m = /(FACTURE|AVOIR) N[°º]\s*(\d+)/.exec(t))) { r.numero = r.numero || m[2]; if (m[1] === 'AVOIR') r.avoir = true; }
      if ((m = /^du (\d\d\/\d\d\/\d{4})/.exec(t))) r.date = r.date || facDate(m[1]);
      if ((m = /^(\d\d\/\d\d\/\d{4}) LCR/.exec(t))) r.echeance = r.echeance || facDate(m[1]);
      if ((m = /^(\d{8}) (\d\d\/\d\d\/\d{4}) \S+ (\d\d\/\d\d\/\d{4})/.exec(t)) && !bl) { bl = m[1]; r.bls.push({ numero: bl, date: facDate(m[2]) }); r.echeance = facDate(m[3]); }
      if ((m = /TOTAL TTC \(EUR\) (-?[\d\s]+,\d{2})/.exec(t))) r.ttc = facNum(m[1]);
      if ((m = /TOTAL TVA (-?[\d\s]+,\d{2})/.exec(t))) r.tva = facNum(m[1]);
      if ((m = /^(-?[\d\s]+,\d{2}) € \d+,\d{2}%/.exec(t))) r.ht = facNum(m[1]);
      // Droit de garde et cotisation Interbev, sous les lignes de chaque BL (« 1,8 » pour 1,80 €)
      if ((m = /^(?:Drt Grd|Interbev\b[^\d-]*) (-?\d+,\d{1,2})$/.exec(t))) r.frais = Math.round(((r.frais || 0) + facNum(m[1])) * 100) / 100;
      if ((m = /^([A-Z0-9][A-Z0-9/]+)\s+(.+?)\s+(-?\d+)\s+(-?[\d\s]+,\d{3})\s+(KG|PC|U)\s+(\d+,\d{3})\s+(-?[\d\s]+,\d{2})$/.exec(t)))
        r.lignes.push({ bl, ref: m[1], nom: m[2].trim(), qte: facNum(m[4]), unite: m[5], colis: facNum(m[3]), pu: facNum(m[6]), montant: facNum(m[7]) });
    });
    if (r.ttc != null && r.tva != null) r.ht = Math.round((r.ttc - r.tva) * 100) / 100;
    return r;
  },
};
function facParseurPour(f) {
  const s = facSup(f.fournisseur_id); const n = facNorm(s ? s.nom : '');
  if (n.includes('lodifrais')) return 'lodifrais';
  if (n.includes('ds ') || n.includes('sirf')) return 'ds';
  if (n.includes('jardins')) return 'jardins';
  if (n.includes('mericq') || n.includes('merik')) return 'mericq';
  if (n.includes('blason')) return 'blason';
  if (n.includes('yesfood') || n.includes('yes food')) return 'yesfood';
  if (n.includes('bihan')) return 'lebihan';
  if (n.includes('richard')) return 'cafe';
  if (n.includes('cocktail')) return 'cocktails';
  if (n.includes('platins') || n.includes('plantins')) return 'platins';
  if (n.includes('carniato')) return 'carniato';
  return null;
}
async function facAnalyser(f, force) {
  if (!f.pdf_path) return;
  const parseur = facParseurPour(f);
  const L = await facLignesDoc(f);
  const res = parseur ? FAC_PARSEURS[parseur](L) : { bls: [], lignes: [] };
  if (!res.ht && res.lignes.length) res.ht = Math.round(res.lignes.reduce((a, l) => a + (l.montant || 0), 0) * 100) / 100;
  // Avoir : détecté par le lecteur, par le script d'import ou par l'en-tête du PDF ; montants toujours en négatif
  if (f.type === 'avoir' || L.slice(0, 40).some(t => /\bAVOIRS?\b(?!\s+de prix)|\bA\s+V\s+O\s+I\s+R\b/.test(t) && !/facture ou avoir/i.test(t))) res.avoir = true;
  if (res.avoir) {
    ['ht', 'tva', 'ttc', 'frais'].forEach(k => { if (res[k] != null && res[k] > 0) res[k] = -res[k]; });
    res.lignes.forEach(l => { if (l.montant > 0) l.montant = -l.montant; if (l.qte > 0) l.qte = -l.qte; });
  }
  const patch = {
    lignes_json: { parseur, bls: res.bls, lignes: res.lignes, frais: res.frais || 0, avoir: !!res.avoir, nb_lignes_texte: L.length, analyse_le: new Date().toISOString() },
    numero: res.numero || f.numero || null, type: res.avoir ? 'avoir' : (f.type || 'facture'),
    date_facture: res.date || f.date_facture || null,
    date_echeance: res.echeance || f.date_echeance || null,
    montant_ht: res.ht ?? f.montant_ht ?? null, montant_tva: res.tva ?? f.montant_tva ?? null, montant_ttc: res.ttc ?? f.montant_ttc ?? null,
    updated_at: new Date().toISOString(),
  };
  Object.assign(f, patch);
  const rap = facRapprocher(f);
  f.ecarts_json = patch.ecarts_json = { nb_lignes: res.lignes.length, nb_ecarts: rap.ecarts.length, commandes: rap.commandes.map(c => c.id) };
  await cuiPATCH('cmd_factures?id=eq.' + f.id, patch);
  return rap;
}

// Lecture en série des PDF importés par le script (montants, dates, n°), sans les ouvrir un par un
async function facAnalyserTout() {
  const todo = FAC.rows.filter(f => f.pdf_path && !f.lignes_json);
  let ok = 0, ko = 0;
  for (const f of todo) {
    cuiToast(`Lecture ${ok + ko + 1}/${todo.length}…`);
    try { if (FAC_EST_FACTURE(f)) await facAnalyser(f); else await docTraiter(f); await cuiPATCH('cmd_factures?id=eq.' + f.id, { traite_at: new Date().toISOString() }); ok++; } catch (e) { console.error(f.numero, e); ko++; }
  }
  FAC.rows.sort((a, b) => (b.date_facture || '').localeCompare(a.date_facture || ''));
  facRender();
  cuiToast(`${ok} facture${ok > 1 ? 's' : ''} lue${ok > 1 ? 's' : ''}${ko ? ` · ${ko} en erreur` : ''}`);
}

/* ─── Rapprochement facture ↔ commandes ↔ réception ─── */
// Deux mots se valent s'ils partagent leurs 5 premières lettres ou à une lettre près (Landreau / Landereau)
function facMemeMot(a, b) {
  if (a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5))) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  const ra = a.slice(i), rb = b.slice(i);
  return ra.slice(1) === rb.slice(1) || ra.slice(1) === rb || ra === rb.slice(1);
}
function facScoreNom(a, b) {
  const mots = facNorm(a).split(' ').filter(w => w.length > 2), pm = facNorm(b).split(' ').filter(w => w.length > 2);
  return mots.filter(w => pm.some(x => facMemeMot(w, x))).length / Math.max(1, Math.min(mots.length, pm.length));
}
const facRefNorm = r => String(r || '').replace(/\D/g, '').replace(/^0+/, '');
// Bouteilles par carton, caisse ou pack (« carton de 6 »), prix de l'appli à la bouteille
function facParCarton(p) {
  const m = p && /caisse|carton|pack/i.test(p.unite || '') && /de (\d+)/.exec(p.conditionnement || '');
  return m ? +m[1] : 0;
}
const facProche = (x, y) => x > 0 && y > 0 && Math.abs(x - y) <= Math.max(0.011, y * 0.01);
// Le prix facturé est-il ce prix de l'appli, tel quel, ramené à la bouteille du carton ou au kilo ?
function facPrixProche(l, prix, p) {
  const n = facParCarton(p), kg = p && p.poids_kg ? Number(p.poids_kg) : 0;
  return [prix, prix / n, prix / kg].some(x => facProche(Number(x), l.pu));
}
function facTrouverProduit(f, l) {
  const prods = CUI.prods.filter(p => p.fournisseur_id === f.fournisseur_id);
  if (l.ref) { const p = prods.find(p => p.reference && facRefNorm(p.reference) === facRefNorm(l.ref)); if (p) return p; }
  // À nom aussi proche (« Château d'Alix rouge » : Château d'Alix ou Château d'As Rouge ?), le prix départage
  let best = null, score = 0, prixOk = false;
  prods.forEach(p => {
    const nom = facScoreNom(l.nom, p.nom); if (nom < 0.5) return;
    const px = facPrixProche(l, p.prix, p);
    if (nom > score + 0.001 || (Math.abs(nom - score) <= 0.001 && px && !prixOk)) { best = p; score = nom; prixOk = px; }
  });
  return best;
}
// Lignes facturées ↔ lignes de leur commande, toutes à la fois. Le nom seul départage mal deux
// « Château … rouge » (Platins, 24/09/2026) : le prix et la quantité reçue, convertis au carton
// ou au kilo, départagent. Une référence différente exclut la paire.
function facAssocier(lignes, commandeDe) {
  const paires = [];
  lignes.forEach((l, i) => {
    const o = commandeDe(l); if (!o) return;
    o.lignes.forEach(cl => {
      const p = CUI.prods.find(x => x.id === cl.produit_id);
      const ref = facRefNorm(cl.reference || (p && p.reference)), memeRef = !!(l.ref && ref && ref === facRefNorm(l.ref));
      if (l.ref && ref && !memeRef) return;
      const n = facParCarton(p), kg = p && p.poids_kg ? Number(p.poids_kg) : 0;
      const px = facPrixProche(l, cl.prix, p) || facPrixProche(l, p && p.prix, p);
      const recu = Number(cl.qte_recue != null ? cl.qte_recue : cl.quantite);
      const qt = [recu, recu * n, recu * kg].some(x => facProche(x, Math.abs(l.qte)));
      const nom = memeRef ? 1 : facScoreNom(l.nom, cl.nom);
      if (nom >= 0.5 || (nom > 0 && (px || qt))) paires.push({ i, cl, s: nom + (px ? 0.25 : 0) + (qt ? 0.25 : 0) });
    });
  });
  const res = new Map(), pris = new Set();
  paires.sort((a, b) => b.s - a.s).forEach(x => { if (!res.has(x.i) && !pris.has(x.cl.id)) { res.set(x.i, x.cl); pris.add(x.cl.id); } });
  return res;
}
function facRapprocher(f) {
  const lj = f.lignes_json || { bls: [], lignes: [] };
  const orders = CUI.orders.filter(o => o.fournisseur_id === f.fournisseur_id && o.statut !== 'annulee' && o.statut !== 'brouillon');
  // 1) commandes : par n° de BL saisi à la réception, sinon par date de livraison proche
  const parBl = {};
  const used = o => Object.values(parBl).includes(o);
  lj.bls.forEach(b => {
    const o = orders.find(o => o.numero_bl && o.numero_bl.replace(/\D/g, '') === String(b.numero).replace(/\D/g, ''));
    if (o) parBl[b.numero] = o;
  });
  lj.bls.filter(b => !parBl[b.numero] && b.date).forEach(b => {
    const d = new Date(b.date).getTime();
    const o = orders.filter(o => !used(o) && !o.numero_bl).map(o => ({ o, dt: Math.abs(new Date(o.date_reception || o.date_livraison).getTime() - d) })).filter(x => x.dt <= 2 * 864e5).sort((a, b) => a.dt - b.dt).map(x => x.o)[0];
    if (o) parBl[b.numero] = o;
  });
  const commandes = [...new Set(Object.values(parBl))];
  // 2) lignes
  const commandeDe = l => l.bl ? parBl[l.bl] : commandes[0];
  const assoc = facAssocier(lj.lignes, commandeDe);
  const usedL = new Set([...assoc.values()].map(cl => cl.id));
  const lignes = lj.lignes.map((l, i) => {
    let cl = assoc.get(i) || null;
    const p = cl ? CUI.prods.find(x => x.id === cl.produit_id) || null : facTrouverProduit(f, l);
    const o = commandeDe(l);
    if (!cl && p && o) { cl = o.lignes.find(x => x.produit_id === p.id && !usedL.has(x.id)) || null; if (cl) usedL.add(cl.id); }
    const uf = FAC_UNITES[(l.unite || '').toUpperCase()] || null;
    // Produit commandé au colis et facturé au poids : la quantité se compare dans l'unité de la ligne
    // de commande (celle du jour où elle est partie), le prix dans celle du produit, où il est stocké.
    const poidsQte = p ? facConvPoids({ unite: cl ? cl.unite : p.unite, poids_kg: p.poids_kg }, l.unite) : null;
    const poidsPrix = facConvPoids(p, l.unite_prix || l.unite);
    // Vin commandé au carton, facturé à la bouteille : quantité ramenée au carton, prix déjà à la bouteille comme dans l'appli
    const btl = uf === 'bouteille' && (!cl || /caisse|carton|pack/i.test(cl.unite || '')) ? facParCarton(p) : 0;
    const qteApp = poidsQte ? Math.round(l.qte / poidsQte * 1000) / 1000 : btl ? Math.round(l.qte / btl * 1000) / 1000 : l.qte;
    const compat = !!p && (!!poidsQte || !!btl || (!!uf && facUniteApp(cl ? cl.unite : p.unite) === uf));
    let statut, detail = '';
    if (lj.avoir) { statut = 'avoir'; detail = 'avoir / retour'; }
    else if (!o) { statut = 'sans_commande'; }
    else if (!cl) { statut = 'non_commande'; }
    else {
      const recu = cl.qte_recue != null ? Number(cl.qte_recue) : Number(cl.quantite);
      const tol = typeof cuiPese === 'function' && cuiPese(cl) ? Math.abs(recu) * CUI_TOLERANCE_POIDS : 0.01;
      if (o.statut === 'non_recue') { statut = 'quantite'; detail = 'facturé, commande déclarée non reçue'; }
      else if (compat && Math.abs(recu - qteApp) > tol) { statut = 'quantite'; detail = `facturé ${cuiQty(qteApp)}, ${cl.qte_recue != null ? 'reçu' : 'commandé'} ${cuiQty(recu)}`; }
      else if (cl.ecart) { statut = 'quantite'; detail = cl.ecart; }
      else statut = compat ? 'ok' : 'ok_unite';
    }
    // Prix facturé ramené à l'unité de prix de l'appli (bar : à la bouteille pour les caisses)
    const par = /de (\d+)/.exec(p ? p.conditionnement || '' : ''); const parCaisse = !btl && par && !l.litres && p && /caisse|carton|pack/i.test(p.unite) ? +par[1] : 1;
    const puApp = l.pu ? Math.round((poidsPrix ? l.pu * poidsPrix : l.pu / parCaisse) * 1000) / 1000 : null;
    let prix = null;
    if (p && compat && p.prix != null && puApp) prix = Math.round((puApp - p.prix) / p.prix * 1000) / 10;
    return { ...l, qteApp, produit: p, commande: o, cmdLigne: cl, compat, statut, detail, prix, puApp };
  });
  // 3) reçu mais pas facturé
  const nonFactures = [];
  if (!lj.avoir) commandes.filter(o => o.statut !== 'non_recue').forEach(o => o.lignes.forEach(cl => { if (!usedL.has(cl.id) && (cl.qte_recue == null || Number(cl.qte_recue) > 0)) nonFactures.push({ commande: o, cmdLigne: cl }); }));
  const ecarts = lignes.filter(l => l.statut === 'quantite' || l.statut === 'non_commande');
  return { commandes, lignes, nonFactures, ecarts, parBl };
}

/* ─── Détail d'une facture ─── */
async function facOpen(id, relire) {
  const f = FAC.rows.find(x => x.id === id); if (!f) return;
  const s = facSup(f.fournisseur_id) || {};
  const titre = `${f.type === 'avoir' || (f.lignes_json && f.lignes_json.avoir) ? '↩ Avoir' : '🧾'} ${cuiEsc(s.nom || 'Facture')} · ${cuiEsc(f.numero || '')}`;
  if (f.pdf_path && (!f.lignes_json || relire)) {
    cuiModal(titre, '<div class="empty-state"><span style="display:inline-block;width:20px;height:20px;border:2px solid var(--dim);border-top-color:var(--orange);border-radius:50%;animation:spin .8s linear infinite"></span><br><br>Lecture du PDF…</div>');
    try { await facAnalyser(f, relire); facRender(); }
    catch (e) { console.error(e); cuiToast('Lecture du PDF impossible : ' + e.message); }
  }
  const rap = facRapprocher(f);
  // Le nombre d'écarts de la liste date de la lecture du PDF : on le recale si le rapprochement a changé depuis
  const r = f.ecarts_json;
  if (r && r.nb_ecarts != null && r.nb_ecarts !== rap.ecarts.length && rap.commandes.length) {
    f.ecarts_json = { ...r, nb_ecarts: rap.ecarts.length };
    cuiPATCH('cmd_factures?id=eq.' + f.id, { ecarts_json: f.ecarts_json }).then(facRender).catch(() => {});
  }
  const lj = f.lignes_json || {};
  const stIcon = { ok: '✓', ok_unite: '✓', quantite: '⚠️', non_commande: '❓', sans_commande: '·', avoir: '↩' };
  const stColor = { ok: 'var(--ok)', ok_unite: 'var(--ok)', quantite: 'var(--danger)', non_commande: 'var(--warn)', sans_commande: 'var(--muted)', avoir: 'var(--ok)' };
  const stLabel = { ok: 'conforme', ok_unite: 'reçu (unité différente, quantité non comparée)', quantite: 'écart', non_commande: 'pas dans la commande', sans_commande: 'aucune commande dans l\'appli' , avoir: 'avoir / retour' };
  const lignesHtml = rap.lignes.map(l => `<div class="order-line" style="align-items:flex-start;gap:8px">
      <span style="color:${stColor[l.statut]};width:18px;flex-shrink:0">${stIcon[l.statut]}</span>
      <span style="flex:1;min-width:0">${cuiEsc(l.nom)}${l.produit ? '' : ' <span class="prod-meta">(produit inconnu)</span>'}
        <div class="prod-meta">${l.ref ? cuiEsc(l.ref) + ' · ' : ''}${cuiQty(l.qte)} ${cuiEsc(l.unite)}${l.qteApp !== l.qte ? ' = ' + cuiQty(l.qteApp) + ' ' + cuiEsc(((l.cmdLigne || l.produit || {}).unite || '').toLowerCase()) : ''} × ${cuiEur(l.pu)}${l.statut !== 'ok' ? ' · <span style="color:' + stColor[l.statut] + '">' + (l.detail || stLabel[l.statut]) + '</span>' : ''}${l.prix != null && Math.abs(l.prix) >= 0.5 ? ` · <span style="color:${Math.abs(l.prix) > 10 ? 'var(--warn)' : 'var(--muted)'}">prix ${l.prix > 0 ? '+' : ''}${l.prix} %</span>` : ''}</div>
      </span>
      <span class="order-line-qty">${cuiEur(l.montant)}</span>
    </div>`).join('');
  const nonFact = rap.nonFactures.map(x => `<div class="order-line"><span style="color:var(--muted)">↩ ${cuiEsc(x.cmdLigne.nom)}<div class="prod-meta">reçu ${cuiQty(x.cmdLigne.qte_recue ?? x.cmdLigne.quantite)} ${cuiEsc(x.cmdLigne.unite || '')} (${cuiEsc(cuiNumAff(x.commande))}) — non facturé</div></span></div>`).join('');
  const cmdHtml = lj.bls && lj.bls.length ? lj.bls.map(b => { const o = rap.parBl[b.numero]; return `<div class="prod-meta">BL ${cuiEsc(b.numero)} du ${facD(b.date)} → ${o ? `<b style="color:var(--text)">${cuiEsc(cuiNumAff(o))}</b> (${o.date_reception ? 'réceptionnée ' + facD(o.date_reception) + (o.numero_bl ? ', BL ' + cuiEsc(o.numero_bl) : '') : 'livraison prévue ' + facD(o.date_livraison) + ', non réceptionnée'})` : '<span style="color:var(--warn)">aucune commande trouvée</span>'}</div>`; }).join('') : '<div class="prod-meta">Aucun bon de livraison identifié.</div>';
  const nbE = rap.ecarts.length, lu = facLectureIncomplete(f);
  cuiModal(titre, `
    <div class="modal-section"><div class="cui-kv">
      <div><span>Statut</span><span class="cui-status ${f.statut === 'validee' || f.statut === 'payee' ? 'livree' : f.statut === 'contestee' ? 'annulee' : 'envoyee'}">${FAC_STATUTS[f.statut]}</span></div><div><span>Date</span>${facD(f.date_facture)}</div>
      <div><span>Échéance</span>${facD(f.date_echeance)}</div><div><span>Montants</span>${f.montant_ht != null ? cuiEur(f.montant_ht) + ' HT' : '—'}${f.montant_ttc != null ? ' · ' + cuiEur(f.montant_ttc) + ' TTC' : ''}</div>
    </div>${f.note ? `<div style="margin-top:8px" class="ms-val">${cuiEsc(f.note)}</div>` : ''}</div>
    <div class="modal-section"><div class="ms-label">Livraisons</div>${cmdHtml}</div>
    ${rap.lignes.length ? `<div class="modal-section"><div class="ms-label">Lignes facturées ${nbE ? `<span style="color:var(--danger)">· ${nbE} écart${nbE > 1 ? 's' : ''}</span>` : rap.commandes.length && lu == null ? '<span style="color:var(--ok)">· conforme</span>' : ''}</div>${lu != null ? `<div class="alert-banner" style="margin:0 0 10px">Lecture incomplète : lignes et frais lus ${cuiEur(lu)} pour ${cuiEur(f.montant_ht)} HT, soit ${cuiEur(Math.abs(f.montant_ht - lu))} d'écart — à contrôler sur le PDF.</div>` : ''}${lignesHtml}${nonFact}</div>` : f.pdf_path ? `<div class="alert-banner" style="margin:0 0 10px">Lignes non lues${lj.parseur ? '' : ' : format de facture inconnu'} — contrôle manuel sur le PDF.</div>` : ''}
    <div class="modal-actions">
      ${f.pdf_path ? facFichiers(f).map((p, k, a) => `<button class="btn-secondary" onclick="facVoirPdf('${f.id}',${k})">📄 ${a.length > 1 ? `PDF ${k + 1}/${a.length}` : 'Voir le PDF'}</button>`).join('') : ''}
      <div class="cui-row-btns">
        ${f.statut === 'a_controler' || f.statut === 'contestee' ? `<button class="btn-primary" onclick="facValider('${f.id}')">✓ Valider</button>` : ''}
        ${f.statut === 'a_controler' ? `<button class="btn-secondary" style="color:var(--danger)" onclick="facContester('${f.id}')">📣 Contester</button>` : ''}
        ${f.statut === 'validee' ? `<button class="btn-secondary" onclick="facStatut('${f.id}','payee')">💶 Payée</button>` : ''}
        ${f.statut === 'contestee' ? `<button class="btn-secondary" onclick="facContester('${f.id}')">📣 Relancer</button>` : ''}
        <button class="btn-secondary" onclick="facEdit('${f.id}')">✏️ Modifier</button>
        ${f.pdf_path ? `<button class="btn-secondary" onclick="facOpen('${f.id}', true)">↻ Relire le PDF</button>` : ''}
      </div>
      ${f.statut === 'a_controler' ? `<button class="btn-close" style="color:var(--danger)" onclick="facSupprimer('${f.id}')">Supprimer</button>` : ''}
      <button class="btn-close" onclick="cuiCloseModal()">Fermer</button>
    </div>`);
}
async function facVoirPdf(id, k = 0) {
  const f = FAC.rows.find(x => x.id === id);
  try {
    const buf = await facFetchPdf(facFichiers(f)[k]);
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
    const w = window.open(url, '_blank');
    if (!w) { const a = document.createElement('a'); a.href = url; a.download = (f.numero || 'facture') + '.pdf'; a.click(); }
  } catch (e) { cuiToast('PDF indisponible'); }
}
async function facStatut(id, statut, extra) {
  const f = FAC.rows.find(x => x.id === id);
  const patch = { statut, ...(extra || {}), updated_at: new Date().toISOString() };
  try { await cuiPATCH('cmd_factures?id=eq.' + id, patch); Object.assign(f, patch); facRender(); facOpen(id); }
  catch (e) { cuiToast('Erreur'); }
}
// Valider = les prix facturés deviennent les prix de référence (quand l'unité est comparable)
async function facValider(id) {
  const f = FAC.rows.find(x => x.id === id);
  const rap = facRapprocher(f);
  let maj = 0;
  for (const l of rap.lignes) {
    if (!l.produit || !l.compat || !l.puApp || l.qte < 0) continue;
    if (Math.abs(Number(l.produit.prix || 0) - l.puApp) < 0.005) continue;
    try {
      await cuiPATCH('cmd_produits?id=eq.' + l.produit.id, { prix: l.puApp, updated_at: new Date().toISOString() });
      await cuiPOST('cmd_prix_historique', { produit_id: l.produit.id, prix: l.puApp, source: 'facture ' + (f.numero || ''), date: f.date_facture || cuiIso(Date.now()) });
      l.produit.prix = l.puApp; maj++;
    } catch (e) { console.error(e); }
  }
  await facStatut(id, 'validee');
  cuiToast(maj ? `Validée · ${maj} prix mis à jour` : 'Facture validée');
}
function facContester(id) {
  const f = FAC.rows.find(x => x.id === id); const s = facSup(f.fournisseur_id) || {};
  const rap = facRapprocher(f);
  const lignes = rap.ecarts.map(l => `• ${l.nom}${l.ref ? ' (réf. ' + l.ref + ')' : ''} : ${l.statut === 'non_commande' ? 'facturé ' + cuiQty(l.qte) + ' ' + l.unite + ' — non commandé / non reçu' : l.detail}`).join('\n');
  const txt = `Bonjour,\n\nBraise & Co Biganos${s.numero_client ? ' (client ' + s.numero_client + ')' : ''} — facture n° ${f.numero || ''} du ${facD(f.date_facture)}.\n\nNous contestons les lignes suivantes :\n${lignes || '(préciser)'}\n\nMerci de nous adresser un avoir.\n\nBraise & Co`;
  FAC._txt = txt;
  cuiModal(`📣 Contestation · ${cuiEsc(s.nom)}`, `
    <div class="modal-section"><div class="ms-label">Message</div><textarea id="fac-c-txt" class="settings-field" rows="9" style="font-size:13px;font-family:inherit">${cuiEsc(txt)}</textarea></div>
    <div class="modal-actions">
      ${s.commercial_tel ? `<a class="btn-primary" href="#" onclick="event.preventDefault();ouvrirSms('${cuiEsc(s.commercial_tel.replace(/\\s/g, ''))}', document.getElementById('fac-c-txt').value)">📨 SMS — ${cuiEsc(s.commercial_nom || s.nom)}</a>` : ''}
      ${s.email ? `<a class="btn-primary" href="#" style="${s.commercial_tel ? 'background:var(--surf3);color:var(--text)' : ''}" onclick="event.preventDefault();window.location.href=buildMailtoUrl('${cuiEsc(s.email)}', 'Contestation facture ${cuiEsc(f.numero || '')} — Braise & Co', document.getElementById('fac-c-txt').value) + cuiCc({email_cc: '${cuiEsc(s.email_cc || '')}'})">✉️ Email — ${cuiEsc(s.nom)}</a>` : ''}
      <button class="btn-secondary" onclick="facStatut('${id}','contestee',{note: document.getElementById('fac-c-txt').value})">Marquer contestée</button>
      <button class="btn-close" onclick="facOpen('${id}')">Retour</button>
    </div>`);
}
async function facSupprimer(id) {
  if (!confirm('Supprimer cette facture de l\'appli ? (le PDF reste chez le comptable)')) return;
  try { await cuiDEL('cmd_factures?id=eq.' + id); FAC.rows = FAC.rows.filter(x => x.id !== id); cuiCloseModal(); facRender(); }
  catch (e) { cuiToast('Erreur'); }
}
// Saisie / correction manuelle (factures papier : Lartigue, ou montants mal lus)
function facEdit(id) {
  const f = id ? FAC.rows.find(x => x.id === id) : { statut: 'a_controler', date_facture: cuiIso(Date.now()) };
  cuiModal(id ? 'Modifier la facture' : 'Nouvelle facture (papier)', `
    <div class="form-row"><label>Fournisseur</label><select id="fac-e-sup">${CUI.sups.map(s => `<option value="${s.id}" ${s.id === f.fournisseur_id ? 'selected' : ''}>${cuiEsc(s.nom)}</option>`).join('')}</select></div>
    <div class="form-2col"><div class="form-row"><label>N° facture</label><input id="fac-e-num" value="${cuiEsc(f.numero || '')}"></div><div class="form-row"><label>Date</label><input id="fac-e-date" type="date" value="${f.date_facture || ''}"></div></div>
    <div class="form-2col"><div class="form-row"><label>Total HT</label><input id="fac-e-ht" type="number" step="0.01" inputmode="decimal" value="${f.montant_ht ?? ''}"></div><div class="form-row"><label>Total TTC</label><input id="fac-e-ttc" type="number" step="0.01" inputmode="decimal" value="${f.montant_ttc ?? ''}"></div></div>
    <div class="form-2col"><div class="form-row"><label>Échéance</label><input id="fac-e-ech" type="date" value="${f.date_echeance || ''}"></div><div class="form-row"><label>Statut</label><select id="fac-e-st">${Object.entries(FAC_STATUTS).map(([k, l]) => `<option value="${k}" ${k === f.statut ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="form-row"><label>Note</label><input id="fac-e-note" value="${cuiEsc(f.note || '')}"></div>
    <div class="modal-actions"><button class="btn-primary" onclick="facSave('${id || ''}')">Enregistrer</button><button class="btn-close" onclick="${id ? `facOpen('${id}')` : 'cuiCloseModal()'}">Annuler</button></div>`);
}
async function facSave(id) {
  const v = k => cui$('fac-e-' + k).value;
  const ht = facNum(v('ht')), ttc = facNum(v('ttc'));
  const data = { fournisseur_id: v('sup'), numero: v('num').trim() || null, date_facture: v('date') || null, date_echeance: v('ech') || null, montant_ht: ht, montant_ttc: ttc, montant_tva: ht != null && ttc != null ? Math.round((ttc - ht) * 100) / 100 : null, statut: v('st'), note: v('note').trim() || null, updated_at: new Date().toISOString() };
  try {
    if (id) { const [row] = await cuiPATCH('cmd_factures?id=eq.' + id, data); Object.assign(FAC.rows.find(x => x.id === id), row); facRender(); facOpen(id); }
    else { const [row] = await cuiPOST('cmd_factures', data); FAC.rows.unshift(row); facRender(); facOpen(row.id); }
    cuiToast('Enregistré');
  } catch (e) { console.error(e); cuiToast('Erreur'); }
}

/* ─── Récap achats : montants réellement facturés par fournisseur ─── */
async function facTotauxAnnee(year, month) {
  const rows = await cuiGET(`cmd_factures?statut=in.(validee,payee,contestee,a_controler,historique)&type=in.(facture,avoir)&date_facture=gte.${year}-01-01&date_facture=lt.${year + 1}-01-01&select=id,fournisseur_id,numero,montant_ht,date_facture,statut,lignes_json&order=date_facture`);
  const bySup = {}, byMonth = {}, nSup = {}, factures = []; let total = 0, n = 0, nonLues = 0;
  rows.forEach(f => {
    const m = new Date(f.date_facture).getMonth();
    if (month != null && m !== month) return;
    if (f.montant_ht == null) { nonLues++; return; }
    const t = Number(f.montant_ht); total += t; n++;
    bySup[f.fournisseur_id] = (bySup[f.fournisseur_id] || 0) + t; nSup[f.fournisseur_id] = (nSup[f.fournisseur_id] || 0) + 1;
    byMonth[m] = (byMonth[m] || 0) + t;
    factures.push({ id: f.id, fournisseur_id: f.fournisseur_id, numero: f.numero, date: f.date_facture, ht: t, avoir: !!(f.lignes_json && f.lignes_json.avoir) });
  });
  return { bySup, byMonth, nSup, factures, total, n, nonLues };
}

/* ─── Hausses de prix sur la période (historique des prix : factures, accusés, confirmations) ─── */
async function facHaussesPrix(year, month) {
  const rows = await cuiGET(`cmd_prix_historique?date=gte.${year - 1}-01-01&date=lt.${year + 1}-01-01&select=produit_id,prix,date,source,created_at&order=produit_id,date,created_at`);
  const debut = month == null ? `${year}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const fin = month == null ? `${year + 1}-01-01` : `${month === 11 ? year + 1 : year}-${String((month + 1) % 12 + 1).padStart(2, '0')}-01`;
  const parProduit = {}; let prev = null;
  rows.forEach(r => {
    // Seuls les prix constatés sur un document fournisseur comptent comme évolution (pas les saisies / imports)
    const constate = /facture|avoir|accus|confirmation|relev/i.test(r.source || '');
    if (constate && prev && prev.produit_id === r.produit_id && r.date >= debut && r.date < fin && prev.prix > 0 && Number(r.prix) !== Number(prev.prix)) {
      const p = CUI.prods.find(x => x.id === r.produit_id);
      if (p) {
        const h = parProduit[p.id];
        if (!h) parProduit[p.id] = { produit: p, avant: Number(prev.prix), apres: Number(r.prix), date: r.date, source: r.source };
        else { h.apres = Number(r.prix); h.date = r.date; h.source = r.source; }
      }
    }
    prev = r;
  });
  return Object.values(parProduit).map(h => ({ ...h, pct: Math.round((h.apres - h.avant) / h.avant * 1000) / 10 })).filter(h => Math.abs(h.pct) >= 0.5).sort((a, b) => b.pct - a.pct);
}
