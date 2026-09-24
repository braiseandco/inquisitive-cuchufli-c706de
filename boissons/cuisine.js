/* ═══════════════ CUISINE — commandes fournisseurs (tables Supabase cmd_*) ═══════════════
   Onglet "Cuisine" de l'app Boissons. Toutes les fonctions sont préfixées cui pour ne pas
   entrer en collision avec celles du bar (setQty, save, fmt…). Le panier est un brouillon
   partagé en base : ce qu'on coche sur la tablette apparaît sur le téléphone. */

const CUI = { sups: [], cats: [], prods: [], drafts: [], orders: [], photos: [], supId: null, cat: 'all', loaded: false };
const CUI_UNITES = ['Kilo(s)', 'Pièce(s)', 'Poche(s)', 'Bac(s)', 'Carton(s)', 'Boîte(s)', 'Bouteille(s)', 'Sac(s)', 'Colis', 'Seau', 'Bidon', 'Litre(s)', 'Lot(s)', 'Sachet', 'Filet', 'Barquette(s)', 'Plateau(x)'];

async function cuiSb(path, opts = {}) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 10000);
  const { headers: extra, ...rest } = opts;
  try {
    const r = await fetch(SB_URL + '/rest/v1/' + path, { ...rest, signal: ctrl.signal,
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...extra } });
    clearTimeout(tid);
    if (!r.ok) throw new Error(await r.text());
    const t = await r.text();
    return t ? JSON.parse(t) : [];
  } catch (e) { clearTimeout(tid); throw e; }
}
const cuiGET   = p => cuiSb(p);
const cuiPOST  = (p, b) => cuiSb(p, { method: 'POST', body: JSON.stringify(b) });
const cuiPATCH = (p, b) => cuiSb(p, { method: 'PATCH', body: JSON.stringify(b) });
const cuiDEL   = p => cuiSb(p, { method: 'DELETE' });

const cui$ = id => document.getElementById(id);
const cuiEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cuiEur = n => (n == null || isNaN(n)) ? '' : Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const cuiQty = n => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const cuiD  = d => d ? new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
const cuiDT = d => d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const cuiIso = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
function cuiWho() { return (typeof settings !== 'undefined' && settings.serveur) || ''; }
function cuiToast(m) {
  const d = document.createElement('div');
  d.textContent = m;
  d.style.cssText = 'position:fixed;bottom:150px;left:50%;transform:translateX(-50%);background:#1e1e1e;color:#fff;padding:10px 22px;border-radius:20px;font-size:13px;font-weight:700;z-index:9999;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.4)';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2500);
}
const cuiSup = id => CUI.sups.find(s => s.id === id);
const cuiDraftFor = supId => CUI.drafts.find(d => d.fournisseur_id === supId);
// Ligne de l'accusé de réception / confirmation du fournisseur (même référence) : le fournisseur
// facture parfois au kilo une quantité en pièces, son montant de ligne fait foi sur prix × quantité
const cuiRefNum = r => r ? String(r).replace(/\D/g, '').replace(/^0+/, '') : '';
const cuiConfLigne = (o, l) => o && o.confirmation_json && l.reference ? (o.confirmation_json.lignes || []).find(c => cuiRefNum(c.ref) === cuiRefNum(l.reference)) : null;
const cuiLineTotal = (l, o) => { const c = cuiConfLigne(o, l); if (c && c.montant != null) return c.montant; return (l.prix != null && l.quantite) ? l.prix * l.quantite : null; };
const cuiOrderTotal = o => o.confirmation_json && o.confirmation_json.ht != null ? o.confirmation_json.ht : (o.lignes || []).reduce((a, l) => a + (cuiLineTotal(l, o) || 0), 0);
const CUI_UNITES_FOURN = { KG: 'kg', L: 'L', PI: 'pièce(s)', SO: 'seau(x)', SA: 'sac(s)', BT: 'boîte(s)', LO: 'lot(s)', CT: 'carton(s)', CO: 'carton(s)', BD: 'bidon(s)', PO: 'pot(s)' };
const cuiConfQte = (o, l) => {
  const c = cuiConfLigne(o, l); if (!c || c.qte == null) return '';
  if (!c.qte) return ' · <span style="color:var(--danger)">rupture</span>';
  const un = u => CUI_UNITES_FOURN[u] || (u || '').toLowerCase();
  // Produit commandé au colis, confirmé au kilo : on affiche d'abord le nombre de poches
  const poids = typeof facConvPoids === 'function' ? facConvPoids({ unite: l.unite, poids_kg: cuiPoids(l) }, c.unite) : null;
  if (poids) return ` · confirmé ${cuiQty(Math.round(c.qte / poids * 100) / 100)} ${(l.unite || '').toLowerCase()} (${cuiQty(c.qte)} ${un(c.unite)})`;
  const u = (c.unite_prix && c.unite_prix !== c.unite && c.montant && c.pu) ? ` = ${cuiQty(Math.round(c.montant / c.pu * 100) / 100)} ${un(c.unite_prix)}` : '';
  return ` · confirmé ${cuiQty(c.qte)} ${un(c.unite)}${u}`;
};
// Poids d'une unité de commande, porté par la fiche produit (2,5 kg pour une poche)
const cuiPoids = l => { const p = CUI.prods.find(x => x.id === l.produit_id); return p ? p.poids_kg : null; };
// Recherche sans accents : « creme brulee » ou « oeufs » doivent trouver « crème brûlée » et « œufs »
const cuiNorm = s => (s || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const cuiStatus = s => ({ brouillon: 'Brouillon', envoyee: 'Envoyée', confirmee: 'Confirmée', livree: 'Livrée', annulee: 'Annulée' }[s] || s);

/* ─── Chargement ─── */
async function cuiLoad(silent) {
  try {
    const [sups, cats, prods, drafts, orders, photos] = await Promise.all([
      cuiGET('cmd_fournisseurs?order=ordre,nom'),
      cuiGET('cmd_categories?order=ordre,nom'),
      cuiGET('cmd_produits?actif=eq.true&order=ordre,nom'),
      cuiGET('cmd_commandes?statut=eq.brouillon&select=*,lignes:cmd_commande_lignes(*)'),
      cuiGET('cmd_commandes?statut=neq.brouillon&select=*,lignes:cmd_commande_lignes(*)&order=date_commande.desc&limit=200'),
      cuiGET('cmd_bl_photos?order=created_at.desc&limit=300').catch(() => []),
    ]);
    Object.assign(CUI, { sups, cats, prods, drafts, orders, photos, loaded: true });
    cuiRender();
    if (typeof facAutoLire === 'function') setTimeout(facAutoLire, 1500);
  } catch (e) { console.error(e); if (!silent) cuiToast('Cuisine : erreur de connexion'); }
}
function cuiRender() {
  if (!CUI.loaded) return;
  if (CUI.supId && !cui$('cui-sup').classList.contains('hidden')) { cuiRenderChips(); cuiRenderProducts(); cuiRenderBar(); }
  else if (!cui$('cui-hist').classList.contains('hidden')) cuiRenderHistory();
  else if (!cui$('cui-fact').classList.contains('hidden')) { if (typeof facRender === 'function') facRender(); }
  else cuiRenderHome();
}
function cuiOnTab() {
  if (!CUI.loaded) { cui$('cui-grid').innerHTML = '<div class="empty-state">Chargement…</div>'; cuiLoad(); }
  else cuiRender();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && CUI.loaded) cuiLoad(true);
});

/* ─── Accueil : fournisseurs + dernières commandes ─── */
function cuiShowHome() {
  cui$('cui-home').classList.remove('hidden'); cui$('cui-sup').classList.add('hidden'); cui$('cui-hist').classList.add('hidden'); cui$('cui-fact').classList.add('hidden');
  CUI.supId = null; cuiRenderHome(); cuiRenderBar();
}
const CUI_JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const CUI_JOURS_COURT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
// Fournisseurs à commander aujourd'hui (rappel_jours) sans commande envoyée depuis ce matin
function cuiRappels() {
  const now = new Date(); const jour = now.getDay(); const debut = new Date(now); debut.setHours(4, 0, 0, 0);
  return CUI.sups.filter(s => (s.rappel_jours || []).includes(jour)
    && !CUI.orders.some(o => o.fournisseur_id === s.id && o.statut !== 'brouillon' && o.statut !== 'annulee' && new Date(o.date_commande) >= debut));
}
function cuiOuvrirRappel(id) {
  const s = cuiSup(id);
  if (s && s.actif === false && /bihan/i.test(s.nom) && typeof switchTab === 'function') switchTab('commande');
  else cuiShowSup(id);
}
function cuiRenderHome() {
  const rap = cuiRappels();
  cui$('cui-rappels').innerHTML = rap.length ? `<div class="alert-banner" style="margin:4px 16px 8px;display:flex;align-items:center;gap:10px;cursor:pointer" onclick="cuiOuvrirRappel('${rap[0].id}')"><span style="font-size:20px">⏰</span><span style="flex:1"><b>À commander aujourd'hui</b> : ${rap.map(s => (s.emoji || '') + ' ' + cuiEsc(s.nom)).join(', ')}</span><span>›</span></div>` : '';
  cui$('cui-grid').innerHTML = CUI.sups.filter(s => s.actif !== false).map(s => {
    const rappel = rap.includes(s);
    const d = cuiDraftFor(s.id); const n = d ? d.lignes.length : 0;
    const last = CUI.orders.find(o => o.fournisseur_id === s.id);
    const np = CUI.prods.filter(p => p.fournisseur_id === s.id).length;
    return `<button class="cui-card" onclick="cuiShowSup('${s.id}')" style="${rappel ? 'border-color:var(--orange)' : ''}">
      ${n ? `<span class="cui-badge">${n}</span>` : rappel ? '<span class="cui-badge" style="background:var(--orange)">⏰</span>' : ''}
      <div class="cui-card-emoji">${s.emoji || '📦'}</div>
      <div class="cui-card-name">${cuiEsc(s.nom)}</div>
      <div class="cui-card-meta">${np} produit${np > 1 ? 's' : ''}${last ? ' · ' + cuiD(last.date_commande) : ''}${(s.rappel_jours || []).length ? '<br>⏰ ' + s.rappel_jours.slice().sort().map(j => CUI_JOURS_COURT[j]).join(' ') : s.jours_commande ? '<br>⏰ ' + cuiEsc(s.jours_commande) : ''}</div>
    </button>`;
  }).join('') + `<button class="cui-card cui-card-add" onclick="cuiOpenSupEdit(true)">＋ Fournisseur</button>`;
  // Une livraison du jour ne doit jamais sortir de l'écran d'accueil : le 23/09, la commande
  // Le Bihan attendue le matin était passée 7e derrière des commandes créées depuis des accusés.
  const auj = cuiIso(Date.now());
  const aRecevoir = CUI.orders.filter(o => (o.statut === 'envoyee' || o.statut === 'confirmee') && o.date_livraison && o.date_livraison <= auj && o.date_livraison >= cuiIso(Date.now() - 864e5));
  const liste = aRecevoir.concat(CUI.orders.filter(o => !aRecevoir.includes(o)).slice(0, Math.max(0, 6 - aRecevoir.length)));
  cui$('cui-orders').innerHTML = liste.map(cuiOrderRow).join('') || '<div class="empty-state">Aucune commande pour l\'instant.</div>';
}
function cuiOrderRow(o) {
  const s = cuiSup(o.fournisseur_id) || {};
  const tot = cuiOrderTotal(o);
  return `<div class="hist-item cui-order-row" onclick="cuiOpenOrder('${o.id}')">
    <div class="hist-date">${cuiDT(o.date_commande)} · livraison ${cuiD(o.date_livraison)}${o.commande_par ? ' · ' + cuiEsc(o.commande_par) : ''}</div>
    <div class="hist-summary">${s.emoji || '📦'} ${cuiEsc(s.nom || '?')} <span class="cui-status ${o.statut}">${cuiStatus(o.statut)}</span><span style="float:right;color:var(--orange)">${tot ? cuiEur(tot) : ''}</span></div>
    <div class="hist-detail">${o.lignes.length} ligne${o.lignes.length > 1 ? 's' : ''} · ${cuiEsc(o.numero || '')}${o.date_reception ? (cuiEcarts(o).length ? ` · <span style="color:var(--danger)">⚠️ ${cuiEcarts(o).length} écart${cuiEcarts(o).length > 1 ? 's' : ''}</span>` : ' · <span style="color:var(--ok)">✓ conforme</span>') : ''}</div>
  </div>`;
}

/* ─── Fournisseur : liste produits ─── */
function cuiShowSup(id) {
  CUI.supId = id; CUI.cat = 'all'; cui$('cui-search').value = '';
  const s = cuiSup(id);
  cui$('cui-sup-title').textContent = (s.emoji ? s.emoji + ' ' : '') + s.nom;
  const contact = s.mode_commande === 'sms' ? 'SMS ' + (s.telephone || '') : s.mode_commande === 'appel' ? '📞 ' + (s.telephone || '') : s.email;
  cui$('cui-sup-sub').textContent = [s.jours_commande, contact, s.commercial_nom ? s.commercial_nom + ' ' + (s.commercial_tel || '') : null].filter(Boolean).join(' · ');
  const d = cuiDraftFor(id); cui$('cui-note').value = d && d.note ? d.note : '';
  cui$('cui-home').classList.add('hidden'); cui$('cui-hist').classList.add('hidden'); cui$('cui-fact').classList.add('hidden'); cui$('cui-sup').classList.remove('hidden');
  cuiRenderChips(); cuiRenderProducts(); cuiRenderBar();
  cui$('panel-cuisine').scrollTop = 0;
}
const cuiSupCats = () => CUI.cats.filter(c => c.fournisseur_id === CUI.supId);
function cuiRenderChips() {
  const favs = CUI.prods.some(p => p.fournisseur_id === CUI.supId && p.favori);
  const minis = CUI.prods.some(p => p.fournisseur_id === CUI.supId && p.stock_mini != null);
  const chips = [['all', 'Tous'], ...(favs ? [['fav', '★ Favoris']] : []), ...cuiSupCats().map(c => [c.id, c.nom]), ['__cats', '✎ Catégories'], ...(minis ? [['__mini', '⚡ Pré-remplir minis']] : [])];
  const act = { __cats: 'cuiOpenCats()', __mini: 'cuiPrefillMini()' };
  cui$('cui-chips').innerHTML = chips.map(([k, l]) => `<button class="cui-chip ${CUI.cat === k ? 'on' : ''}" onclick="${act[k] || `cuiSetCat('${k}')`}">${cuiEsc(l)}</button>`).join('');
}
// Le stock mini est une indication : on pré-remplit avec, puis on ajuste selon le stock réel
function cuiPrefillMini() {
  const d = cuiDraftFor(CUI.supId); const inCart = new Set((d ? d.lignes : []).map(l => l.produit_id));
  const todo = CUI.prods.filter(p => p.fournisseur_id === CUI.supId && p.stock_mini != null && !inCart.has(p.id));
  if (!todo.length) { cuiToast('Rien à pré-remplir'); return; }
  todo.forEach(p => cuiSetQty(p.id, p.stock_mini));
  cuiToast(`${todo.length} produit${todo.length > 1 ? 's' : ''} pré-rempli${todo.length > 1 ? 's' : ''} — ajustez selon le stock`);
}
function cuiSetCat(k) { CUI.cat = k; cuiRenderChips(); cuiRenderProducts(); }
function cuiRenderProducts() {
  const q = cuiNorm(cui$('cui-search').value);
  const d = cuiDraftFor(CUI.supId); const inCart = {}; (d ? d.lignes : []).forEach(l => inCart[l.produit_id] = l);
  let prods = CUI.prods.filter(p => p.fournisseur_id === CUI.supId);
  if (q) prods = prods.filter(p => cuiNorm(p.nom + ' ' + (p.reference || '') + ' ' + (p.marque || '')).includes(q));
  else if (CUI.cat === 'fav') prods = prods.filter(p => p.favori);
  else if (CUI.cat !== 'all') prods = prods.filter(p => p.categorie_id === CUI.cat);
  if (!prods.length) { cui$('cui-list').innerHTML = `<div class="empty-state">${q ? 'Aucun produit ne correspond.' : 'Aucun produit.<br>Ajoutez-en avec le bouton ＋.'}</div>`; return; }
  const grouped = (CUI.cat === 'all' || CUI.cat === 'fav' || q);
  const byCat = {};
  prods.forEach(p => { const k = grouped ? (p.categorie_id || '_') : '_solo'; (byCat[k] = byCat[k] || []).push(p); });
  const catName = id => (CUI.cats.find(c => c.id === id) || {}).nom || 'Sans catégorie';
  const order = [...cuiSupCats().map(c => c.id), '_', '_solo'];
  cui$('cui-list').innerHTML = order.filter(k => byCat[k]).map(k =>
    (k === '_solo' ? '' : `<div class="cat-label">${cuiEsc(k === '_' ? 'Sans catégorie' : catName(k))}</div>`) + byCat[k].map(p => cuiProdRow(p, inCart[p.id])).join('')
  ).join('');
}
function cuiProdRow(p, line) {
  const q = line ? line.quantite : 0;
  return `<div class="prod-row ${q ? 'has-qty' : ''}" id="cui-p-${p.id}">
    <button class="cui-star ${p.favori ? 'on' : ''}" onclick="cuiToggleFav('${p.id}')">★</button>
    <div class="prod-info" onclick="cuiOpenProdEdit('${p.id}')">
      <div class="prod-name">${cuiEsc(p.nom)}</div>
      <div class="prod-meta">${p.reference ? '<span class="prod-code">' + cuiEsc(p.reference) + '</span> · ' : ''}${cuiEsc(p.unite)}${p.prix != null ? ' · <b style="color:var(--text)">' + cuiEur(p.prix) + '</b>' : ''}${p.stock_mini != null ? ' · <span style="color:var(--warn)">mini ' + cuiQty(p.stock_mini) + '</span>' : ''}${p.derniere_commande ? ' · ' + cuiD(p.derniere_commande) : ''}</div>
    </div>
    <div class="stepper">
      <button class="s-btn" onclick="cuiAddQty('${p.id}',-1)">−</button>
      <input type="number" inputmode="decimal" class="s-qty ${q ? 'active' : ''}" value="${q || ''}" placeholder="0" onchange="cuiSetQty('${p.id}',this.value)" onfocus="this.select()">
      <button class="s-btn plus" onclick="cuiAddQty('${p.id}',1)">+</button>
    </div>
  </div>`;
}
async function cuiToggleFav(id) {
  const p = CUI.prods.find(x => x.id === id); p.favori = !p.favori;
  cuiRenderProducts(); cuiRenderChips();
  await cuiPATCH('cmd_produits?id=eq.' + id, { favori: p.favori }).catch(() => cuiToast('Erreur'));
}

/* ─── Panier (brouillon partagé) ───
   L'interface est mise à jour tout de suite ; les écritures passent par une file unique,
   sinon deux appuis rapides créent deux brouillons. */
let cuiQueue = Promise.resolve();
function cuiEnqueue(fn) { cuiQueue = cuiQueue.then(fn).catch(e => { console.error(e); cuiToast("Erreur d'enregistrement"); }); return cuiQueue; }
function cuiLocalDraft(supId) {
  let d = cuiDraftFor(supId);
  if (!d) { d = { id: null, fournisseur_id: supId, statut: 'brouillon', lignes: [] }; CUI.drafts.push(d); }
  return d;
}
async function cuiPersistDraft(d) {
  if (d.id) return;
  const [row] = await cuiPOST('cmd_commandes', { fournisseur_id: d.fournisseur_id, statut: 'brouillon', note: d.note || null });
  Object.assign(d, row, { lignes: d.lignes });
}
function cuiAddQty(pid, delta) {
  const d = cuiDraftFor(CUI.supId); const l = d && d.lignes.find(x => x.produit_id === pid);
  cuiSetQty(pid, Math.max(0, (l ? Number(l.quantite) : 0) + delta));
}
function cuiSetQty(pid, val) {
  const n = Math.max(0, parseFloat(String(val).replace(',', '.')) || 0);
  const p = CUI.prods.find(x => x.id === pid);
  const d = cuiLocalDraft(CUI.supId);
  let l = d.lignes.find(x => x.produit_id === pid);
  if (!n) {
    if (!l) return;
    d.lignes = d.lignes.filter(x => x !== l); l._del = true;
    cuiRefreshRow(p, null); cuiRenderBar();
    cuiEnqueue(async () => { if (l.id) await cuiDEL('cmd_commande_lignes?id=eq.' + l.id); });
    return;
  }
  if (l) {
    l.quantite = n; cuiRefreshRow(p, l); cuiRenderBar();
    cuiEnqueue(async () => { if (l.id) await cuiPATCH('cmd_commande_lignes?id=eq.' + l.id, { quantite: n }); });
    return;
  }
  l = { produit_id: pid, nom: p.nom, unite: p.unite, reference: p.reference, prix: p.prix, quantite: n, ordre: d.lignes.length };
  d.lignes.push(l); cuiRefreshRow(p, l); cuiRenderBar();
  cuiEnqueue(async () => {
    await cuiPersistDraft(d);
    if (l._del) return;
    const [row] = await cuiPOST('cmd_commande_lignes', { commande_id: d.id, produit_id: l.produit_id, nom: l.nom, unite: l.unite, reference: l.reference, prix: l.prix, quantite: l.quantite, ordre: l.ordre });
    l.id = row.id;
  });
}
function cuiRefreshRow(p, line) {
  const el = cui$('cui-p-' + p.id); if (!el) return;
  const tmp = document.createElement('div'); tmp.innerHTML = cuiProdRow(p, line); el.replaceWith(tmp.firstElementChild);
}
let cuiNoteTimer = null;
function cuiSaveNote() {
  const d = cuiLocalDraft(CUI.supId); d.note = cui$('cui-note').value;
  clearTimeout(cuiNoteTimer);
  cuiNoteTimer = setTimeout(() => cuiEnqueue(async () => { if (d.id) await cuiPATCH('cmd_commandes?id=eq.' + d.id, { note: d.note || null }); }), 600);
}
function cuiRenderBar() {
  const bar = cui$('panier-bar-cuisine');
  const d = CUI.supId ? cuiDraftFor(CUI.supId) : null; const n = d ? d.lignes.length : 0;
  const onTab = cui$('tab-cuisine').classList.contains('active');
  bar.style.display = (onTab && CUI.supId) ? '' : 'none';
  cui$('cui-bar-info').textContent = n ? `${n} produit${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''}` : 'Aucun produit sélectionné';
  cui$('cui-bar-info').className = n ? '' : 'panier-empty';
  cui$('cui-bar-total').textContent = d && cuiOrderTotal(d) ? cuiEur(cuiOrderTotal(d)) + ' HT' : '';
  cui$('cui-btn-send').disabled = !n;
}
function cuiClearDraft() {
  const d = cuiDraftFor(CUI.supId); if (!d) return;
  if (!confirm('Vider le panier ?')) return;
  CUI.drafts = CUI.drafts.filter(x => x !== d); d.lignes.forEach(l => l._del = true);
  cuiCloseModal(); cui$('cui-note').value = ''; cuiRenderProducts(); cuiRenderBar();
  cuiEnqueue(async () => { if (d.id) await cuiDEL('cmd_commandes?id=eq.' + d.id); });
}

/* ─── Confirmation + envoi (SMS / mail / copie, comme pour le bar) ─── */
function cuiNextNumero() {
  const ymd = cuiIso(Date.now()).slice(2).replace(/-/g, '');
  const n = CUI.orders.filter(o => (o.numero || '').startsWith('BC' + ymd)).length + 1;
  return 'BC' + ymd + '-' + String(n).padStart(2, '0');
}
// Numéro définitif, lu en base au moment d'enregistrer : la liste locale ne voit pas les
// commandes passées depuis l'autre appareil, d'où deux BC260920-02 le 20/09
async function cuiNumeroLibre() {
  const ymd = cuiIso(Date.now()).slice(2).replace(/-/g, '');
  const rows = await cuiGET(`cmd_commandes?numero=like.BC${ymd}-*&select=numero`);
  const n = rows.reduce((m, r) => Math.max(m, parseInt(r.numero.split('-')[1], 10) || 0), 0) + 1;
  return 'BC' + ymd + '-' + String(n).padStart(2, '0');
}
function cuiOrderText(o) {
  const s = cuiSup(o.fournisseur_id) || {};
  const lines = o.lignes.map(l => `• ${cuiQty(l.quantite)} ${l.unite || ''} — ${l.nom}${l.reference ? ' (réf. ' + l.reference + ')' : ''}`).join('\n');
  const liv = new Date(o.date_livraison).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return `Bonjour,\n\nCommande Braise & Co Biganos${s.numero_client ? ' (client ' + s.numero_client + ')' : ''}\nN° ${o.numero} — livraison souhaitée le ${liv}\n\n${lines}\n${o.note ? '\nNote : ' + o.note + '\n' : ''}\nMerci,\n${o.commande_par || ''} — Braise & Co\n174 av. de la Côte d'Argent, 33380 Biganos`;
}
// Copie systématique au restaurant : trace de chaque commande dans la boîte mail
const CUI_CC = 'braiseandcobiganos@gmail.com';
function cuiCc(s) { return '&cc=' + encodeURIComponent([CUI_CC, s.email_cc].filter(Boolean).join(',')); }
function cuiOrderById(id) { return CUI.orders.find(x => x.id === id) || CUI._pending; }
// Fournisseur en mode SMS : texte court, envoyé au fournisseur puis en copie au restaurant
function cuiOrderSmsText(o) {
  const lines = o.lignes.map(l => `- ${cuiQty(l.quantite)} ${l.unite || ''} ${l.nom}`).join('\n');
  const liv = new Date(o.date_livraison).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return `Bonjour, commande Braise & Co Biganos pour ${liv} :\n${lines}${o.note ? '\n' + o.note : ''}\nMerci, ${o.commande_par || ''}`;
}
// Le mail ou le SMS s'ouvre dans une autre appli : on enregistre la commande avant de quitter la page,
// sinon elle reste en brouillon sans numéro quand personne ne revient taper « terminer »
async function cuiEnregistrerAvantEnvoi(id) {
  const o = cuiOrderById(id);
  if (!CUI._pending || o !== CUI._pending) return o;
  await cuiValidate();
  if (CUI._pending) return o;
  const saved = cuiOrderById(o.id); const s = cuiSup(saved.fournisseur_id) || {};
  cuiModal(`${cuiEsc(s.nom)} · ${cuiEsc(saved.numero)}`, `
    <div class="prod-meta" style="margin-bottom:10px">Commande enregistrée. Si l'envoi n'a pas abouti, renvoyez-la :</div>
    <div class="modal-actions">${cuiSendButtons(saved)}<button class="btn-close" onclick="cuiCloseModal()">Fermer</button></div>`);
  return saved;
}
async function cuiSendSms(id, tel) { const o = await cuiEnregistrerAvantEnvoi(id); ouvrirSms(tel.replace(/\s/g, ''), cuiOrderSmsText(o)); }
// Le mail part de la boîte du restaurant (script Google, commandes-mail/envoyer-commande.gs) :
// la commande ne passe en « envoyée » que si Gmail a accepté le mail. Avec l'appli mail du
// téléphone, la commande DS du 23/09 est restée coincée 25 h alors qu'elle était « envoyée ».
const CUI_MAIL_URL = 'https://script.google.com/macros/s/AKfycby33o4eLrk5ACzJwkLJ91Zr9iWeZmDWAzUx3fIrcJs9mORUNZAPceugRA51SoIJ030M/exec';
async function cuiEnvoyerMail(id) {
  const r = await fetch(CUI_MAIL_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ id }) });
  const res = await r.json();
  if (!res.ok) throw new Error(res.error || 'réponse inattendue');
  return res.commande;
}
async function cuiSendMail(id, btn) {
  const pending = CUI._pending && cuiOrderById(id) === CUI._pending;
  const o = cuiOrderById(id); const s = cuiSup(o.fournisseur_id) || {};
  if (!pending && !confirm(`Renvoyer la commande ${o.numero} à ${s.nom} ?`)) return;
  if (btn) { btn.style.pointerEvents = 'none'; btn.textContent = '⏳ Envoi en cours…'; }
  try {
    let cmdId = o.id;
    if (pending) {
      const d = cuiDraftFor(CUI.supId);
      await cuiQueue; await cuiPersistDraft(d);
      o.numero = await cuiNumeroLibre(); o.numero_fixe = true;
      await cuiPATCH('cmd_commandes?id=eq.' + d.id, { numero: o.numero, date_livraison: o.date_livraison, note: o.note || null, commande_par: o.commande_par || null });
      cmdId = d.id;
    }
    const row = await cuiEnvoyerMail(cmdId);
    if (pending) await cuiValidate();
    else { Object.assign(o, { mail_envoye_le: row.mail_envoye_le, mail_erreur: null }); cuiCloseModal(); }
    cuiToast(`✉️ Commande ${o.numero} envoyée à ${s.nom}`);
  } catch (e) {
    console.error(e);
    alert(`❌ La commande n'est PAS partie chez ${s.nom}.\n\n${e.message}\n\nRéessayez, ou appelez le fournisseur.`);
    if (btn) { btn.style.pointerEvents = ''; btn.textContent = `✉️ Envoyer à ${s.nom}`; }
  }
}
function cuiSendButtons(o) {
  const s = cuiSup(o.fournisseur_id) || {};
  if (s.mode_commande === 'appel') return `
    <div class="modal-section" style="margin-bottom:8px"><div class="ms-label">À dicter au téléphone</div><div class="ms-val" style="font-size:13px">${cuiEsc(cuiOrderSmsText(o))}</div></div>
    ${s.telephone ? `<a class="btn-primary" href="tel:${cuiEsc(s.telephone.replace(/\s/g, ''))}">📞 Appeler ${cuiEsc(s.nom)} · ${cuiEsc(s.telephone)}</a>` : '<div class="alert-banner" style="margin:0 0 8px">⚠️ Pas de numéro pour ce fournisseur — renseignez-le via ⚙️.</div>'}
    <button class="btn-secondary" style="margin-top:8px" onclick="cuiCopy('${o.id}')">📋 Copier le texte</button>`;
  if (s.mode_commande === 'sms') return `
    ${s.telephone ? `<div style="font-size:12px;color:var(--muted);margin-bottom:6px;font-weight:600">SMS · ${cuiEsc(s.nom)} ${cuiEsc(s.telephone)}</div><a class="btn-primary" href="#" onclick="event.preventDefault();cuiSendSms('${o.id}','${cuiEsc(s.telephone)}')">📨 SMS — ${cuiEsc(s.nom)}</a>` : '<div class="alert-banner" style="margin:0 0 8px">⚠️ Pas de numéro pour ce fournisseur — renseignez-le via ⚙️.</div>'}
    ${s.sms_copie_tel ? `<div style="font-size:12px;color:var(--muted);margin:8px 0 6px;font-weight:600">SMS copie · ${cuiEsc(s.sms_copie_tel)}</div><a class="btn-primary" href="#" style="background:var(--surf3);color:var(--text)" onclick="event.preventDefault();cuiSendSms('${o.id}','${cuiEsc(s.sms_copie_tel)}')">📨 SMS — copie restaurant</a>` : ''}
    <button class="btn-secondary" style="margin-top:8px" onclick="cuiCopy('${o.id}')">📋 Copier le texte</button>`;
  return `
    ${s.email ? `<div style="font-size:12px;color:var(--muted);margin-bottom:6px;font-weight:600">Email · ${cuiEsc(s.email)} · copie ${CUI_CC}${s.email_cc ? ', ' + cuiEsc(s.email_cc) : ''}</div><a class="btn-primary" href="#" onclick="event.preventDefault();cuiSendMail('${o.id}', this)">✉️ Envoyer à ${cuiEsc(s.nom)}</a>` : '<div class="alert-banner" style="margin:0 0 8px">⚠️ Pas d\'e-mail pour ce fournisseur — renseignez-le via ⚙️.</div>'}
    <button class="btn-secondary" style="margin-top:8px" onclick="cuiCopy('${o.id}')">📋 Copier le texte (WhatsApp…)</button>`;
}
function cuiOpenConfirm() {
  const d = cuiDraftFor(CUI.supId); if (!d || !d.lignes.length) return;
  const s = cuiSup(CUI.supId);
  const defDate = d.date_livraison || cuiIso(Date.now() + (s.delai_livraison_jours || 1) * 864e5);
  CUI._pending = { ...d, numero: cuiNextNumero(), date_livraison: defDate, commande_par: cuiWho(), note: cui$('cui-note').value.trim() };
  cuiModal(`Commander ${cuiEsc(s.nom)}`, `
    <div class="modal-section"><div class="ms-label">Livraison souhaitée</div><input type="date" class="settings-field" id="cui-c-date" value="${defDate}" onchange="CUI._pending.date_livraison=this.value"></div>
    <div class="modal-section"><div class="ms-label">Produits commandés</div><div id="cui-c-lines">${d.lignes.map(cuiRecapLine).join('')}</div></div>
    <div class="modal-section"><div class="ms-label">Montant HT estimé</div><div class="ms-val" id="cui-c-total">${cuiEur(cuiOrderTotal(d)) || '—'}</div></div>
    ${CUI._pending.note ? `<div class="modal-section"><div class="ms-label">Note</div><div class="ms-val">${cuiEsc(CUI._pending.note)}</div></div>` : ''}
    <div class="modal-actions">${cuiSendButtons(CUI._pending)}
      <button class="btn-close" onclick="cuiValidate()">${s.mode_commande === 'appel' ? '✓ Commande passée — terminer' : s.mode_commande === 'sms' ? '✓ Commande envoyée — terminer' : 'Déjà transmise autrement — terminer'}</button>
      <button class="btn-close" style="color:var(--danger)" onclick="cuiClearDraft()">Vider le panier</button>
    </div>`);
}
function cuiRecapLine(l) {
  return `<div class="order-line" style="align-items:center;gap:8px">
    <span style="flex:1">${cuiEsc(l.nom)}<div class="prod-meta">${cuiEsc(l.unite || '')}${l.prix != null ? ' · ' + cuiEur(l.prix) : ''}</div></span>
    <span class="stepper"><button class="s-btn" style="width:30px;height:32px" onclick="cuiCartQty('${l.produit_id}',-1)">−</button><input type="number" inputmode="decimal" class="s-qty active" style="width:44px;height:32px;font-size:15px" value="${l.quantite}" onchange="cuiCartQty('${l.produit_id}',null,this.value)"><button class="s-btn plus" style="width:30px;height:32px" onclick="cuiCartQty('${l.produit_id}',1)">+</button></span>
    <span class="order-line-qty" style="min-width:58px;text-align:right">${cuiEur(cuiLineTotal(l))}</span>
  </div>`;
}
function cuiCartQty(pid, delta, val) {
  const d = cuiDraftFor(CUI.supId); const l = d.lignes.find(x => x.produit_id === pid);
  cuiSetQty(pid, val != null ? val : Math.max(0, Number(l.quantite) + delta));
  const nd = cuiDraftFor(CUI.supId);
  if (!nd || !nd.lignes.length) { cuiCloseModal(); return; }
  CUI._pending.lignes = nd.lignes;
  cui$('cui-c-lines').innerHTML = nd.lignes.map(cuiRecapLine).join('');
  cui$('cui-c-total').textContent = cuiEur(cuiOrderTotal(nd)) || '—';
}
async function cuiValidate() {
  const d = cuiDraftFor(CUI.supId); if (!d) return;
  const p = CUI._pending;
  if (!p.date_livraison) { cuiToast('Date de livraison obligatoire'); return; }
  try {
    await cuiQueue; await cuiPersistDraft(d);
    if (!p.numero_fixe) p.numero = await cuiNumeroLibre();
    const patch = { statut: 'envoyee', numero: p.numero, date_commande: new Date().toISOString(), date_livraison: p.date_livraison, note: p.note || null, commande_par: p.commande_par || null, total_estime: cuiOrderTotal(d) || null, updated_at: new Date().toISOString() };
    const [row] = await cuiPATCH('cmd_commandes?id=eq.' + d.id, patch);
    const o = { ...row, lignes: d.lignes };
    CUI.drafts = CUI.drafts.filter(x => x !== d); CUI.orders.unshift(o); CUI._pending = null;
    const today = cuiIso(Date.now());
    const ids = d.lignes.map(l => l.produit_id).filter(Boolean);
    if (ids.length) { await cuiPATCH('cmd_produits?id=in.(' + ids.join(',') + ')', { derniere_commande: today }); CUI.prods.forEach(x => { if (ids.includes(x.id)) x.derniere_commande = today; }); }
    cuiCloseModal(); cui$('cui-note').value = ''; cuiRenderProducts(); cuiRenderBar();
    cuiToast('Commande ' + o.numero + ' enregistrée');
  } catch (e) { console.error(e); cuiToast('Erreur, réessayez'); }
}
async function cuiCopy(id) {
  const o = cuiOrderById(id); const s = cuiSup(o.fournisseur_id) || {};
  const txt = s.mode_commande === 'mail' ? cuiOrderText(o) : cuiOrderSmsText(o);
  try { await navigator.clipboard.writeText(txt); cuiToast('📋 Commande copiée'); }
  catch { prompt('Copiez le texte :', txt); }
}

/* ─── Détail d'une commande passée ─── */
function cuiOpenOrder(id) {
  const o = CUI.orders.find(x => x.id === id); if (!o) return;
  const s = cuiSup(o.fournisseur_id) || {};
  cuiModal(`${s.emoji || ''} ${cuiEsc(s.nom)} · ${cuiEsc(o.numero || '')}`, `
    <div class="modal-section"><div class="cui-kv">
      <div><span>Statut</span><span class="cui-status ${o.statut}">${cuiStatus(o.statut)}</span></div><div><span>Livraison</span>${cuiD(o.date_livraison)}</div>
      <div><span>Commandé le</span>${cuiDT(o.date_commande)}</div><div><span>Par</span>${cuiEsc(o.commande_par || '—')}</div>
    </div>${o.note ? `<div style="margin-top:8px"><div class="ms-label">Note</div><div class="ms-val">${cuiEsc(o.note)}</div></div>` : ''}
    ${o.confirmation_json ? `<div class="prod-meta" style="margin-top:8px">✓ Confirmation fournisseur n° ${cuiEsc(o.confirmation_json.numero || '')}${o.confirmation_json.date ? ' du ' + cuiD(o.confirmation_json.date) : ''}${o.confirmation_json.ht != null ? ' · ' + cuiEur(o.confirmation_json.ht) + ' HT' : ''}</div>` : ''}
    ${o.mail_envoye_le ? `<div class="prod-meta" style="margin-top:4px;color:var(--ok)">✉️ Mail parti le ${cuiDT(o.mail_envoye_le)}</div>` : o.mail_erreur ? `<div class="prod-meta" style="margin-top:4px;color:var(--danger)">⚠️ Dernier envoi du mail en échec : ${cuiEsc(o.mail_erreur)}</div>` : ''}
    ${o.bl_json && !o.date_reception ? `<div class="prod-meta" style="margin-top:4px;color:var(--ok)">📄 BL ${cuiEsc(o.bl_json.numero || '')} reçu par mail — la réception est pré-remplie</div>` : ''}
    <div id="cui-o-photos">${cuiPhotoLigne(o.id)}</div></div>
    <div class="modal-section"><div class="ms-label">Produits</div>
      ${o.lignes.map(l => `<div class="order-line"><span>${cuiEsc(l.nom)}<div class="prod-meta">${l.reference ? cuiEsc(l.reference) + ' · ' : ''}${l.prix != null ? cuiEur(l.prix) + ' / ' : ''}${cuiEsc(l.unite || '')}${cuiEcartHtml(l)}</div></span><span class="order-line-qty">${cuiQty(l.quantite)} ${cuiEsc(l.unite || '')}${cuiConfQte(o, l)}${cuiLineTotal(l, o) != null ? ' · ' + cuiEur(cuiLineTotal(l, o)) : ''}</span></div>`).join('')}
    </div>
    ${o.date_reception ? `<div class="modal-section"><div class="ms-label">Réception</div><div class="ms-val">${cuiDT(o.date_reception)}${o.recu_par ? ' par ' + cuiEsc(o.recu_par) : ''}${o.numero_bl ? ' · BL ' + cuiEsc(o.numero_bl) : ''}<br>${cuiEcarts(o).length ? '<span style="color:var(--danger)">⚠️ ' + cuiEcarts(o).length + ' écart' + (cuiEcarts(o).length > 1 ? 's' : '') + '</span>' : '<span style="color:var(--ok)">✓ Conforme</span>'}${o.reception_note ? '<br>' + cuiEsc(o.reception_note) : ''}</div>
      ${cuiEcarts(o).length ? `<button class="btn-secondary" style="margin-top:8px" onclick="cuiOpenReclamation('${o.id}')">📣 Réclamation fournisseur</button>` : ''}</div>` : ''}
    <div class="modal-section"><div class="ms-label">Montant HT ${o.confirmation_json && o.confirmation_json.ht != null ? 'confirmé par le fournisseur' : 'estimé'}</div><div class="ms-val">${cuiEur(cuiOrderTotal(o)) || '—'}</div></div>
    <div class="modal-actions">
      <div class="cui-row-btns">
        ${o.statut === 'envoyee' ? `<button class="btn-secondary" onclick="cuiSetStatus('${o.id}','confirmee')">✓ Confirmée</button>` : ''}
        ${o.statut !== 'annulee' ? `<button class="btn-secondary" style="${o.date_reception ? '' : 'background:var(--orange);color:#fff'}" onclick="cuiOpenReception('${o.id}')">📦 ${o.date_reception ? 'Modifier la réception' : 'Réceptionner'}</button>` : ''}
        ${o.date_reception
          ? `<button class="btn-secondary" onclick="cuiReorder('${o.id}')">↻ Recommander</button>`
          : `<button class="btn-secondary" onclick="document.getElementById('cui-o-photo-input').click()">📷 Prendre photo</button>
             <input type="file" accept="image/*" capture="environment" id="cui-o-photo-input" style="display:none" onchange="cuiPhotoBL('${o.id}', this)">`}
        ${o.statut !== 'annulee' ? `<button class="btn-secondary" style="color:var(--danger)" onclick="cuiSetStatus('${o.id}','annulee')">Annuler</button>` : ''}
      </div>
      <details style="margin-top:6px"><summary style="color:var(--muted);font-size:13px;cursor:pointer;padding:6px 0">Renvoyer la commande…</summary><div style="padding-top:8px">${cuiSendButtons(o)}</div></details>
      <button class="btn-close" onclick="cuiCloseModal()">Fermer</button>
    </div>`);
}
async function cuiSetStatus(id, statut) {
  const o = CUI.orders.find(x => x.id === id);
  if (statut === 'annulee' && !confirm('Annuler cette commande ?')) return;
  o.statut = statut; cuiOpenOrder(id); cuiRender();
  await cuiPATCH('cmd_commandes?id=eq.' + id, { statut, updated_at: new Date().toISOString() }).catch(() => cuiToast('Erreur'));
}
function cuiReorder(id) {
  const o = CUI.orders.find(x => x.id === id);
  const existing = cuiDraftFor(o.fournisseur_id);
  if (existing && existing.lignes.length && !confirm('Le panier de ce fournisseur contient déjà des produits. Les remplacer ?')) return;
  cuiCloseModal();
  if (existing) {
    CUI.drafts = CUI.drafts.filter(x => x !== existing); existing.lignes.forEach(l => l._del = true);
    cuiEnqueue(async () => { if (existing.id) await cuiDEL('cmd_commandes?id=eq.' + existing.id); });
  }
  const d = cuiLocalDraft(o.fournisseur_id);
  d.lignes = o.lignes.map((l, i) => { const p = CUI.prods.find(x => x.id === l.produit_id); return { produit_id: p ? p.id : null, nom: p ? p.nom : l.nom, unite: p ? p.unite : l.unite, reference: p ? p.reference : l.reference, prix: p ? p.prix : l.prix, quantite: l.quantite, ordre: i }; });
  cuiEnqueue(async () => {
    await cuiPersistDraft(d);
    const rows = await cuiPOST('cmd_commande_lignes', d.lignes.map(l => ({ commande_id: d.id, produit_id: l.produit_id, nom: l.nom, unite: l.unite, reference: l.reference, prix: l.prix, quantite: l.quantite, ordre: l.ordre })));
    rows.forEach((r, i) => d.lignes[i].id = r.id);
  });
  cuiShowSup(o.fournisseur_id); cuiToast('Panier pré-rempli');
}


/* ─── Réception de livraison : contrôle du BL ligne par ligne ─── */
const CUI_PB = ['Abîmé', 'Périmé / DLC courte', 'Mauvais produit', 'Non commandé'];
// Produits pesés (viande, poisson, fruits & légumes au kilo) : la quantité livrée varie forcément
// autour de la quantité commandée. Jusqu'à 10 % d'écart, ce n'est pas une anomalie.
const CUI_TOLERANCE_POIDS = 0.10;
function cuiPese(l) { return /^(kilo|kg|kilos?|kilo\(s\))$/i.test((l.unite || '').trim()); }
function cuiQteOk(l, recu) {
  const cmd = Number(l.quantite), r = Number(recu);
  if (r === cmd) return true;
  return cuiPese(l) && cmd > 0 && Math.abs(r - cmd) / cmd <= CUI_TOLERANCE_POIDS;
}
function cuiEcarts(o) { return o.lignes.filter(l => l.qte_recue != null && (!cuiQteOk(l, l.qte_recue) || l.ecart)); }
function cuiEcartHtml(l) {
  if (l.qte_recue == null) return '';
  const diff = Number(l.qte_recue) - Number(l.quantite);
  if (cuiQteOk(l, l.qte_recue) && !l.ecart) return ` · <span style="color:var(--ok)">✓ reçu${diff ? ' ' + cuiQty(l.qte_recue) : ''}</span>`;
  return ` · <span style="color:var(--danger)">${diff ? 'reçu ' + cuiQty(l.qte_recue) + ' / ' + cuiQty(l.quantite) : ''}${diff && l.ecart ? ' · ' : ''}${l.ecart ? cuiEsc(l.ecart) : ''}</span>`;
}
function cuiOpenReception(id) {
  const o = CUI.orders.find(x => x.id === id); if (!o) return;
  const s = cuiSup(o.fournisseur_id) || {};
  // BL reçu par mail : quantités livrées proposées d'office (unités compatibles seulement)
  const bl = o.bl_json && !o.date_reception ? o.bl_json : null;
  const qteBl = l => {
    if (!bl) return null;
    const bls = bl.lignes.filter(x => (x.produit_id && x.produit_id === l.produit_id) || (x.ref && l.reference && x.ref.replace(/^0+/, '') === String(l.reference).replace(/^0+/, '')));
    if (!bls.length) return null;
    const u = typeof FAC_UNITES !== 'undefined' ? FAC_UNITES[(bls[0].unite || '').toUpperCase()] : null;
    const poids = typeof facConvPoids === 'function' ? facConvPoids({ unite: l.unite, poids_kg: cuiPoids(l) }, bls[0].unite) : null;
    if (!poids && u && typeof facUniteApp === 'function' && facUniteApp(l.unite) !== u) return null;
    const q = bls.reduce((a, x) => a + Number(x.qte || 0), 0);
    return poids ? Math.round(q / poids * 100) / 100 : q;
  };
  CUI._rec = { id, lines: o.lignes.map(l => { const q = qteBl(l); return { id: l.id, nom: l.nom, unite: l.unite, quantite: Number(l.quantite), qte_recue: l.qte_recue != null ? Number(l.qte_recue) : q != null ? q : Number(l.quantite), ecart: l.ecart || '', bl: q != null }; }) };
  cuiModal(`📦 Réception · ${cuiEsc(s.nom)}`, `
    <div class="prod-meta" style="margin-bottom:10px">Commande ${cuiEsc(o.numero || '')} · livraison prévue ${cuiD(o.date_livraison)}. ${bl ? `<b>Bon de livraison ${cuiEsc(bl.numero || '')} reçu par mail</b> : les quantités livrées sont pré-remplies, vérifiez la marchandise et corrigez si besoin.` : 'Comparez avec le bon de livraison : corrigez les quantités reçues, signalez un problème.'}</div>
    <div class="form-2col">
      <div class="form-row"><label>N° du BL (facultatif)</label><input id="cui-r-bl" value="${cuiEsc(o.numero_bl || (bl && bl.numero) || '')}"></div>
      <div class="form-row"><label>Réceptionné par</label><input id="cui-r-who" value="${cuiEsc(o.recu_par || cuiWho())}"></div>
    </div>
    <div class="modal-section">
      <div class="ms-label">Photo du bon de livraison</div>
      <div id="cui-r-photos">${cuiPhotosHtml(id)}</div>
      <input type="file" accept="image/*" capture="environment" id="cui-r-photo-input" style="display:none" onchange="cuiPhotoBL('${id}', this)">
      <button class="btn-secondary" style="margin-top:8px" onclick="document.getElementById('cui-r-photo-input').click()">📷 Photographier le BL</button>
      <div class="prod-meta" style="margin-top:6px">La photo est rattachée à cette commande : le contrôle du BL n'aura pas à deviner de quelle livraison il s'agit.</div>
    </div>
    <div class="modal-section" id="cui-r-lines">${CUI._rec.lines.map(cuiRecLine).join('')}</div>
    <div class="form-row"><label>Remarque</label><input id="cui-r-note" value="${cuiEsc(o.reception_note || '')}" placeholder="ex : colis ouvert, chauffeur prévenu"></div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="cuiSaveReception()">✓ Valider la réception</button>
      <button class="btn-secondary" onclick="cuiRecAllOk()">Tout est conforme</button>
      <button class="btn-close" onclick="cuiOpenOrder('${id}')">Annuler</button>
    </div>`);
}
/* ─── Photo du BL papier ───
   DS et quelques autres ne livrent qu'un bon papier. La photo est prise depuis
   l'écran Réception, donc la commande est connue : le rattachement n'a pas à être
   deviné plus tard, c'est ce qui rendait la lecture automatique risquée. */
const CUI_PHOTO_MAX = 2400;   // côté le plus long, suffisant pour lire un BL
const CUI_PHOTO_Q   = 0.85;

function cuiPhotosDe(commandeId) { return CUI.photos.filter(p => p.commande_id === commandeId); }
function cuiPhotoLigne(commandeId) {
  const n = cuiPhotosDe(commandeId).length;
  return n ? `<div class="prod-meta" style="margin-top:4px;color:var(--ok)">📷 ${n} photo${n > 1 ? 's' : ''} du BL papier</div>` : '';
}
function cuiPhotosHtml(commandeId) {
  const ph = cuiPhotosDe(commandeId);
  if (!ph.length) return '<div class="prod-meta">Aucune photo pour l\'instant.</div>';
  return ph.map(p => `<div class="order-line"><span>📷 ${cuiDT(p.created_at)}<div class="prod-meta">${p.prise_par ? cuiEsc(p.prise_par) + ' · ' : ''}${p.traite_at ? '<span style="color:var(--ok)">lue</span>' : 'à lire'}</div></span>
    <span><button class="btn-secondary" style="padding:6px 12px;font-size:12px" onclick="cuiVoirPhoto('${cuiEsc(p.path)}')">Voir</button></span></div>`).join('');
}

// Une photo de téléphone pèse 4 Mo : on la réduit avant l'envoi, sans descendre
// sous ce qu'il faut pour relire les colonnes chiffrées d'un bon de livraison.
function cuiReduireImage(file) {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => {
      const f = Math.min(1, CUI_PHOTO_MAX / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      c.toBlob(b => b ? ok(b) : ko(new Error('conversion impossible')), 'image/jpeg', CUI_PHOTO_Q);
    };
    img.onerror = () => ko(new Error('image illisible'));
    img.src = URL.createObjectURL(file);
  });
}

async function cuiPhotoBL(commandeId, input) {
  const file = input.files && input.files[0]; input.value = '';
  if (!file) return;
  const o = CUI.orders.find(x => x.id === commandeId);
  cuiToast('Envoi de la photo…');
  try {
    const blob = await cuiReduireImage(file).catch(() => file);
    const path = `bl/${cuiIso(Date.now())}/${(o && o.numero ? o.numero : commandeId).replace(/[^\w-]/g, '')}_${Date.now()}.jpg`;
    const r = await fetch(`${SB_URL}/storage/v1/object/factures/${path}`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'image/jpeg' },
      body: blob
    });
    if (!r.ok) throw new Error(await r.text());
    const [row] = await cuiPOST('cmd_bl_photos', { commande_id: commandeId, path, prise_par: cuiWho() || null });
    CUI.photos.unshift(row);
    const rec = cui$('cui-r-photos'); if (rec) rec.innerHTML = cuiPhotosHtml(commandeId);
    const det = cui$('cui-o-photos'); if (det) det.innerHTML = cuiPhotoLigne(commandeId);
    cuiToast('✓ Photo enregistrée');
  } catch (e) { console.error(e); cuiToast("La photo n'est pas partie — réessayez"); }
}

async function cuiVoirPhoto(path) {
  try {
    const r = await fetch(`${SB_URL}/storage/v1/object/authenticated/factures/${path}`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    if (!r.ok) throw new Error(r.status);
    const url = URL.createObjectURL(await r.blob());
    if (!window.open(url, '_blank')) { const a = document.createElement('a'); a.href = url; a.download = path.split('/').pop(); a.click(); }
  } catch (e) { cuiToast('Photo indisponible'); }
}

function cuiRecLine(l, i) {
  const bad = !cuiQteOk(l, l.qte_recue) || l.ecart;
  return `<div class="order-line" style="flex-direction:column;align-items:stretch;gap:6px;padding:9px 0" id="cui-rl-${i}">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="flex:1;${bad ? 'color:var(--danger)' : ''}">${cuiEsc(l.nom)}<div class="prod-meta">commandé : <b>${cuiQty(l.quantite)} ${cuiEsc(l.unite || '')}</b>${l.bl ? ' · <span style="color:var(--ok)">selon BL</span>' : ''}</div></span>
      <span class="stepper"><button class="s-btn" style="width:30px;height:32px" onclick="cuiRecQty(${i},-1)">−</button><input type="number" inputmode="decimal" class="s-qty ${bad ? '' : 'active'}" style="width:48px;height:32px;font-size:15px;${bad ? 'border-color:var(--danger);color:var(--danger)' : ''}" value="${l.qte_recue}" onchange="cuiRecQty(${i},null,this.value)"><button class="s-btn plus" style="width:30px;height:32px" onclick="cuiRecQty(${i},1)">+</button></span>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${CUI_PB.map(pb => `<button class="cui-chip ${l.ecart === pb ? 'on' : ''}" style="padding:4px 10px;font-size:11px" onclick="cuiRecPb(${i},'${pb}')">${pb}</button>`).join('')}</div>
  </div>`;
}
function cuiRecRefresh(i) { const el = cui$('cui-rl-' + i); const t = document.createElement('div'); t.innerHTML = cuiRecLine(CUI._rec.lines[i], i); el.replaceWith(t.firstElementChild); }
function cuiRecQty(i, delta, val) {
  const l = CUI._rec.lines[i];
  l.qte_recue = Math.max(0, val != null ? (parseFloat(String(val).replace(',', '.')) || 0) : l.qte_recue + delta);
  cuiRecRefresh(i);
}
function cuiRecPb(i, pb) { const l = CUI._rec.lines[i]; l.ecart = l.ecart === pb ? '' : pb; cuiRecRefresh(i); }
function cuiRecAllOk() { CUI._rec.lines.forEach((l, i) => { l.qte_recue = l.quantite; l.ecart = ''; cuiRecRefresh(i); }); }
async function cuiSaveReception() {
  const r = CUI._rec; const o = CUI.orders.find(x => x.id === r.id);
  const patch = { statut: 'livree', date_reception: new Date().toISOString(), recu_par: cui$('cui-r-who').value.trim() || null, numero_bl: cui$('cui-r-bl').value.trim() || null, reception_note: cui$('cui-r-note').value.trim() || null, updated_at: new Date().toISOString() };
  try {
    await Promise.all(r.lines.map(l => cuiPATCH('cmd_commande_lignes?id=eq.' + l.id, { qte_recue: l.qte_recue, ecart: l.ecart || null })));
    await cuiPATCH('cmd_commandes?id=eq.' + r.id, patch);
    Object.assign(o, patch);
    r.lines.forEach(l => { const x = o.lignes.find(y => y.id === l.id); if (x) { x.qte_recue = l.qte_recue; x.ecart = l.ecart || null; } });
    cuiRender();
    const n = cuiEcarts(o).length;
    if (n) { cuiOpenReclamation(r.id); cuiToast(`${n} écart${n > 1 ? 's' : ''} relevé${n > 1 ? 's' : ''}`); }
    else { cuiOpenOrder(r.id); cuiToast('✓ Livraison conforme'); }
  } catch (e) { console.error(e); cuiToast('Erreur, réessayez'); }
}
function cuiReclamationText(o) {
  const s = cuiSup(o.fournisseur_id) || {};
  const lines = cuiEcarts(o).map(l => {
    const diff = Number(l.qte_recue) - Number(l.quantite);
    let m = `• ${l.nom}${l.reference ? ' (réf. ' + l.reference + ')' : ''} : `;
    if (diff < 0) m += `manque ${cuiQty(-diff)} ${l.unite || ''} (commandé ${cuiQty(l.quantite)}, reçu ${cuiQty(l.qte_recue)})`;
    else if (diff > 0) m += `${cuiQty(diff)} ${l.unite || ''} en trop (commandé ${cuiQty(l.quantite)}, reçu ${cuiQty(l.qte_recue)})`;
    if (l.ecart) m += (diff ? ' — ' : '') + l.ecart.toLowerCase() + (diff ? '' : ` (${cuiQty(l.quantite)} ${l.unite || ''})`);
    return m;
  }).join('\n');
  return `Bonjour,\n\nBraise & Co Biganos${s.numero_client ? ' (client ' + s.numero_client + ')' : ''} — livraison du ${cuiD(o.date_reception)}${o.numero_bl ? ', BL n° ' + o.numero_bl : ''} (notre commande ${o.numero}).\n\nÉcarts constatés à la réception :\n${lines}\n${o.reception_note ? '\n' + o.reception_note + '\n' : ''}\nMerci de nous faire un avoir ou de compléter à la prochaine livraison.\n\n${o.recu_par || ''} — Braise & Co`;
}
// SMS au commercial : version courte de la réclamation, le mail reste la version complète
function cuiReclamationSmsText(o) {
  const lines = cuiEcarts(o).map(l => {
    const diff = Number(l.qte_recue) - Number(l.quantite);
    return `- ${l.nom} : ${diff < 0 ? 'manque ' + cuiQty(-diff) + ' ' + (l.unite || '') : diff > 0 ? cuiQty(diff) + ' ' + (l.unite || '') + ' en trop' : ''}${l.ecart ? (diff ? ', ' : '') + l.ecart.toLowerCase() : ''}`;
  }).join('\n');
  return `Bonjour, Braise & Co Biganos. Problème sur la livraison du ${cuiD(o.date_reception)}${o.numero_bl ? ' (BL ' + o.numero_bl + ')' : ''} :\n${lines}${o.reception_note ? '\n' + o.reception_note : ''}\nMerci de faire le nécessaire. ${o.recu_par || ''}`;
}
function cuiReclamationSms(id) {
  const o = CUI.orders.find(x => x.id === id); const s = cuiSup(o.fournisseur_id) || {};
  ouvrirSms(s.commercial_tel.replace(/\s/g, ''), cuiReclamationSmsText(o));
}
function cuiReclamationMail(id) {
  const o = CUI.orders.find(x => x.id === id); const s = cuiSup(o.fournisseur_id) || {};
  window.location.href = buildMailtoUrl(s.email, `Réclamation livraison ${o.numero_bl ? 'BL ' + o.numero_bl : o.numero} — Braise & Co`, cuiReclamationText(o)) + cuiCc(s);
}
function cuiReclamationCopy(id) { navigator.clipboard.writeText(cuiReclamationText(CUI.orders.find(x => x.id === id))).then(() => cuiToast('📋 Copié')); }
function cuiOpenReclamation(id) {
  const o = CUI.orders.find(x => x.id === id); const s = cuiSup(o.fournisseur_id) || {};
  cuiModal(`📣 Réclamation · ${cuiEsc(s.nom)}`, `
    <div class="modal-section"><div class="ms-label">Message</div><div class="ms-val" style="font-size:13px">${cuiEsc(cuiReclamationText(o))}</div></div>
    <div class="modal-actions">
      ${s.commercial_tel ? `<div style="font-size:12px;color:var(--muted);margin-bottom:6px;font-weight:600">SMS au commercial · ${cuiEsc(s.commercial_nom || '')} ${cuiEsc(s.commercial_tel)}</div><a class="btn-primary" href="#" onclick="event.preventDefault();cuiReclamationSms('${id}')">📨 SMS — ${cuiEsc(s.commercial_nom || s.nom)}</a>` : ''}
      ${s.email ? `<div style="font-size:12px;color:var(--muted);margin:8px 0 6px;font-weight:600">Email · ${cuiEsc(s.email)}</div><a class="btn-primary" href="#" style="${s.commercial_tel ? 'background:var(--surf3);color:var(--text)' : ''}" onclick="event.preventDefault();cuiReclamationMail('${id}')">✉️ Email — ${cuiEsc(s.nom)}</a>` : ''}
      <button class="btn-secondary" onclick="cuiReclamationCopy('${id}')">📋 Copier le texte</button>
      <button class="btn-close" onclick="cuiOpenOrder('${id}')">Retour à la commande</button>
    </div>`);
}

/* ─── Commandes du bar (Le Bihan) : copie dans l'historique commun ───
   L'onglet Le Bihan garde son fonctionnement (SMS), mais la commande est aussi enregistrée
   ici pour la réception du BL et le contrôle de la facture. */
// Les onglets du bar peuvent appeler plusieurs fois de suite (vin + moscato) : on sérialise pour des n° distincts
let cuiSyncChaine = Promise.resolve();
function cuiSyncBarOrder(nomFournisseur, items, note) {
  const p = cuiSyncChaine.then(() => cuiSyncBarOrderNow(nomFournisseur, items, note));
  cuiSyncChaine = p.catch(() => {});
  return p;
}
async function cuiSyncBarOrderNow(nomFournisseur, items, note) {
  if (!CUI.loaded) await cuiLoad(true);
  const sup = CUI.sups.find(s => facNormNom(s.nom) === facNormNom(nomFournisseur));
  // Le 20/09/2026, « Les Plantins » au lieu de « Les Platins » : la commande de vin s'est perdue sans un mot
  if (!sup) { cuiToast(`⚠️ Commande NON enregistrée dans l'appli : fournisseur « ${nomFournisseur} » introuvable`); throw new Error('Fournisseur bar inconnu : ' + nomFournisseur); }
  const prods = CUI.prods.filter(p => p.fournisseur_id === sup.id);
  const lignes = [];
  for (const it of items) {
    let p = it.code ? prods.find(x => x.reference === it.code) : null;
    if (!p) p = prods.find(x => x.nom.toLowerCase() === it.nom.toLowerCase());
    if (!p) {
      const [row] = await cuiPOST('cmd_produits', { fournisseur_id: sup.id, nom: it.nom, unite: it.unite || 'Pièce(s)', prix: it.prix ?? null, reference: it.code || null, conditionnement: it.parCaisse ? `${it.unite} de ${it.parCaisse}` : it.litres ? `${it.litres} L, prix au litre` : null, ordre: prods.length + lignes.length });
      CUI.prods.push(row); p = row;
    }
    // Prix de ligne = prix de l'unité commandée (le bar stocke le litre pour les fûts, la bouteille pour les caisses)
    lignes.push({ produit_id: p.id, nom: p.nom, unite: p.unite, reference: p.reference, prix: p.prix != null ? Math.round(p.prix * (it.litres || it.parCaisse || 1) * 1000) / 1000 : null, quantite: it.qte, ordre: lignes.length });
  }
  const d = new Date(); const liv = new Date(d.getTime() + (sup.delai_livraison_jours ?? 2) * 864e5);
  const [cmd] = await cuiPOST('cmd_commandes', { fournisseur_id: sup.id, statut: 'envoyee', numero: await cuiNumeroLibre(), date_commande: d.toISOString(), date_livraison: cuiIso(liv), note: note || null, commande_par: cuiWho() || null, total_estime: lignes.reduce((a, l) => a + (l.prix || 0) * l.quantite, 0) || null });
  const rows = await cuiPOST('cmd_commande_lignes', lignes.map(l => ({ ...l, commande_id: cmd.id })));
  CUI.orders.unshift({ ...cmd, lignes: rows });
  cuiRender();
  cuiToast(`✓ Commande ${sup.nom} enregistrée (${cmd.numero})`);
}
const facNormNom = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

/* ─── Historique ─── */
function cuiOpenHistory() {
  cui$('cui-hist-sup').innerHTML = '<option value="">Tous les fournisseurs</option>' + CUI.sups.map(s => `<option value="${s.id}">${cuiEsc(s.nom)}</option>`).join('');
  cui$('cui-home').classList.add('hidden'); cui$('cui-sup').classList.add('hidden'); cui$('cui-fact').classList.add('hidden'); cui$('cui-hist').classList.remove('hidden');
  CUI.supId = null; cuiRenderBar(); cuiRenderHistory();
}
function cuiRenderHistory() {
  const f = cui$('cui-hist-sup').value;
  const list = CUI.orders.filter(o => !f || o.fournisseur_id === f);
  cui$('cui-hist-list').innerHTML = list.map(cuiOrderRow).join('') || '<div class="empty-state">Aucune commande.</div>';
}


/* ─── Récap achats par fournisseur : année entière ou un mois ───
   Montant de référence = factures (HT) ; l'estimation vient des commandes au prix de la mercuriale. */
const CUI_MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const CUI_MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
async function cuiOpenRecap(year, month) {
  year = year || new Date().getFullYear();
  if (month === undefined) month = null;
  const titre = month == null ? `Achats ${year}` : `Achats ${CUI_MOIS_LONG[month]} ${year}`;
  cuiModal(titre, '<div class="empty-state">Chargement…</div>');
  let rows;
  try {
    rows = await cuiGET(`cmd_commandes?statut=in.(envoyee,confirmee,livree)&date_commande=gte.${year}-01-01&date_commande=lt.${year + 1}-01-01&select=fournisseur_id,date_commande,lignes:cmd_commande_lignes(quantite,prix)`);
  } catch (e) { cuiModal(titre, '<div class="empty-state">Erreur de connexion</div>'); return; }
  const bySup = {}, byMonth = {};
  let sansPrix = 0, total = 0, nCmd = 0;
  rows.forEach(o => {
    const m = new Date(o.date_commande).getMonth();
    if (month != null && m !== month) return;
    const t = cuiOrderTotal(o); total += t; nCmd++;
    sansPrix += o.lignes.filter(l => l.prix == null).length;
    const a = bySup[o.fournisseur_id] = bySup[o.fournisseur_id] || { n: 0, t: 0 }; a.n++; a.t += t;
    byMonth[m] = (byMonth[m] || 0) + t;
  });
  let fac = { bySup: {}, byMonth: {}, nSup: {}, factures: [], total: 0, n: 0, nonLues: 0 };
  try { if (typeof facTotauxAnnee === 'function') fac = await facTotauxAnnee(year, month); } catch (e) { console.error(e); }
  Object.keys(fac.bySup).forEach(id => { if (!bySup[id]) bySup[id] = { n: 0, t: 0 }; });
  const sups = Object.entries(bySup).sort((a, b) => (fac.bySup[b[0]] || b[1].t) - (fac.bySup[a[0]] || a[1].t));
  const supRows = sups.map(([id, a]) => {
    const s = cuiSup(id) || { nom: 'Fournisseur supprimé' };
    const ft = fac.bySup[id], nf = fac.nSup[id] || 0;
    const meta = [nf ? `${nf} facture${nf > 1 ? 's' : ''}` : '', a.n ? `${a.n} commande${a.n > 1 ? 's' : ''} · estimé ${cuiEur(a.t) || '—'}` : ''].filter(Boolean).join(' · ');
    const det = month != null && nf ? `<div id="cui-recap-det-${id}" class="hidden" style="padding:4px 0 6px 12px;font-size:12px;color:var(--muted)">${fac.factures.filter(f => f.fournisseur_id === id).map(f => `<div style="display:flex;justify-content:space-between"><span>${cuiD(f.date)} · ${f.avoir ? 'avoir ' : 'n° '}${cuiEsc(f.numero || '—')}</span><span>${cuiEur(f.ht)}</span></div>`).join('')}</div>` : '';
    return `<div class="order-line" ${det ? `onclick="cui$('cui-recap-det-${id}').classList.toggle('hidden')" style="cursor:pointer"` : ''}><span>${s.emoji || ''} ${cuiEsc(s.nom)}<div class="prod-meta">${meta}</div></span><span class="order-line-qty">${ft != null ? cuiEur(ft) : '<span style="color:var(--muted)">' + (cuiEur(a.t) || '—') + '</span>'}</span></div>${det}`;
  }).join('') || `<div class="prod-meta">Aucun achat ${month == null ? 'cette année' : 'ce mois-ci'}.</div>`;
  if (fac.n) { Object.assign(byMonth, fac.byMonth); total = fac.total; }
  const maxM = Math.max(1, ...Object.values(byMonth));
  const monthRows = month != null ? '' : `<div class="modal-section"><div class="ms-label">Par mois</div>${CUI_MOIS.map((m, i) => `<div onclick="cuiOpenRecap(${year},${i})" style="display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0;cursor:pointer"><span style="width:34px;color:var(--muted)">${m}</span><div style="flex:1;height:8px;background:var(--surf3);border-radius:4px;overflow:hidden"><div style="width:${Math.round((byMonth[i] || 0) / maxM * 100)}%;height:100%;background:var(--orange)"></div></div><span style="width:74px;text-align:right">${byMonth[i] ? cuiEur(byMonth[i]) : ''}</span></div>`).join('')}</div>`;
  let hausses = [];
  try { if (typeof facHaussesPrix === 'function') hausses = await facHaussesPrix(year, month); } catch (e) { console.error(e); }
  const haussesHtml = hausses.length ? `<div class="modal-section"><div class="ms-label">Prix en hausse ${month == null ? 'cette année' : 'ce mois-ci'}${hausses.filter(h => h.pct < 0).length ? ' (et baisses)' : ''}</div>${hausses.slice(0, 25).map(h => { const s = cuiSup(h.produit.fournisseur_id) || {}; return `<div class="order-line"><span>${cuiEsc(h.produit.nom)}<div class="prod-meta">${s.emoji || ''} ${cuiEsc(s.nom || '')} · ${cuiEur(h.avant)} → ${cuiEur(h.apres)} / ${cuiEsc(h.produit.unite || '')}${h.source ? ' · ' + cuiEsc(h.source) : ''}</div></span><span class="order-line-qty" style="color:${h.pct > 0 ? 'var(--danger)' : 'var(--ok)'}">${h.pct > 0 ? '+' : ''}${h.pct} %</span></div>`; }).join('')}${hausses.length > 25 ? `<div class="prod-meta">… et ${hausses.length - 25} autres</div>` : ''}</div>` : '';
  const y = new Date().getFullYear();
  CUI._recap = { year, month, total, fac, sups, bySup, hausses };
  cuiModal(titre, `
    <div style="display:flex;gap:8px;margin-bottom:8px">${[y - 2, y - 1, y].map(k => `<button class="cui-chip ${k === year ? 'on' : ''}" onclick="cuiOpenRecap(${k},${month})">${k}</button>`).join('')}</div>
    <div class="cui-chips" style="margin-bottom:10px"><button class="cui-chip ${month == null ? 'on' : ''}" onclick="cuiOpenRecap(${year})">Année</button>${CUI_MOIS.map((m, i) => `<button class="cui-chip ${i === month ? 'on' : ''}" onclick="cuiOpenRecap(${year},${i})">${m}</button>`).join('')}</div>
    <div class="modal-section"><div class="ms-label">${fac.n ? 'Total HT facturé' : 'Total HT estimé'}</div><div class="ms-val" style="font-size:22px;font-weight:800;color:var(--orange)">${cuiEur(total)}</div>
      <div class="prod-meta">${fac.n ? `${fac.n} facture${fac.n > 1 ? 's' : ''} · ` : ''}${nCmd} commande${nCmd > 1 ? 's' : ''}${sansPrix ? ` · ⚠️ ${sansPrix} ligne${sansPrix > 1 ? 's' : ''} sans prix` : ''}${fac.nonLues ? ` · <span style="color:var(--danger)">⚠️ ${fac.nonLues} facture${fac.nonLues > 1 ? 's' : ''} sans montant (PDF non lu)</span>` : ''}</div></div>
    <div class="modal-section"><div class="ms-label">Par fournisseur${fac.n ? ' (facturé HT)' : ''}</div>${supRows}</div>
    ${monthRows}
    ${haussesHtml}
    <div class="modal-actions">
      <button class="btn-secondary" onclick="cuiRecapCopy()">📋 Copier le rapport</button>
      <button class="btn-close" onclick="cuiCloseModal()">Fermer</button></div>`);
}
function cuiRecapCopy() {
  const r = CUI._recap; if (!r) return;
  const lines = [`Achats ${r.month == null ? r.year : CUI_MOIS_LONG[r.month] + ' ' + r.year} — Braise & Co`, ''];
  r.sups.forEach(([id, a]) => {
    const s = cuiSup(id) || { nom: '?' }; const ft = r.fac.bySup[id];
    lines.push(`${s.nom} : ${ft != null ? cuiEur(ft) + ' HT' : (cuiEur(a.t) || '—') + ' HT (estimé)'}${r.fac.nSup[id] ? ` (${r.fac.nSup[id]} facture${r.fac.nSup[id] > 1 ? 's' : ''})` : ''}`);
    if (r.month != null) r.fac.factures.filter(f => f.fournisseur_id === id).forEach(f => lines.push(`   ${cuiD(f.date)} ${f.avoir ? 'avoir' : 'n°'} ${f.numero || '—'} : ${cuiEur(f.ht)}`));
  });
  lines.push('', `Total : ${cuiEur(r.total)} HT${r.fac.n ? '' : ' (estimé)'}`);
  if (r.hausses && r.hausses.length) { lines.push('', 'Prix en hausse :'); r.hausses.slice(0, 25).forEach(h => lines.push(`   ${h.produit.nom} : ${cuiEur(h.avant)} → ${cuiEur(h.apres)} (${h.pct > 0 ? '+' : ''}${h.pct} %)`)); }
  if (r.fac.nonLues) lines.push(`(${r.fac.nonLues} facture(s) sans montant, non comptée(s))`);
  navigator.clipboard.writeText(lines.join('\n')).then(() => cuiToast('Rapport copié'));
}

/* ─── Produit : ajout / édition ─── */
function cuiOpenProdEdit(id) {
  const p = id ? CUI.prods.find(x => x.id === id) : { unite: 'Pièce(s)', categorie_id: (CUI.cat !== 'all' && CUI.cat !== 'fav') ? CUI.cat : null };
  const cats = cuiSupCats();
  cuiModal(id ? 'Modifier le produit' : 'Nouveau produit', `
    <div class="form-row"><label>Nom du produit</label><input id="cui-pNom" value="${cuiEsc(p.nom || '')}" placeholder="ex : Beurre doux 250g"></div>
    <div class="form-2col">
      <div class="form-row"><label>Unité</label><input id="cui-pUnite" list="cui-unites" value="${cuiEsc(p.unite || '')}"><datalist id="cui-unites">${CUI_UNITES.map(u => `<option value="${u}">`).join('')}</datalist></div>
      <div class="form-row"><label>Prix HT estimé</label><input id="cui-pPrix" type="number" step="0.01" inputmode="decimal" value="${p.prix ?? ''}" placeholder="0.00"></div>
    </div>
    <div class="form-2col">
      <div class="form-row"><label>Catégorie</label><select id="cui-pCat"><option value="">Sans catégorie</option>${cats.map(c => `<option value="${c.id}" ${c.id === p.categorie_id ? 'selected' : ''}>${cuiEsc(c.nom)}</option>`).join('')}</select></div>
      <div class="form-row"><label>Référence fournisseur</label><input id="cui-pRef" value="${cuiEsc(p.reference || '')}"></div>
    </div>
    <div class="form-row"><label>Conditionnement</label><input id="cui-pCond" value="${cuiEsc(p.conditionnement || '')}" placeholder="ex : carton de 6"></div>
    <div class="form-2col">
      <div class="form-row"><label>Stock mini</label><input id="cui-pMin" type="number" step="0.5" inputmode="decimal" value="${p.stock_mini ?? ''}"></div>
      <div class="form-row"><label>Poids d'une unité (kg)</label><input id="cui-pPoids" type="number" step="0.1" inputmode="decimal" value="${p.poids_kg ?? ''}" placeholder="ex : 2,5 (poche)"></div>
    </div>
    <div class="prod-meta" style="margin:-4px 0 10px">Le poids sert quand le fournisseur facture au kilo ce qu'on commande au colis : ses quantités et ses prix sont alors ramenés à l'unité ci-dessus.</div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="cuiSaveProd('${id || ''}')">Enregistrer</button>
      ${id ? `<button class="btn-close" style="color:var(--danger)" onclick="cuiArchiveProd('${id}')">Retirer de la liste</button>` : ''}
      <button class="btn-close" onclick="cuiCloseModal()">Annuler</button>
    </div>`);
  setTimeout(() => cui$('cui-pNom').focus(), 100);
}
async function cuiSaveProd(id) {
  const nom = cui$('cui-pNom').value.trim(); if (!nom) { cuiToast('Nom obligatoire'); return; }
  const prixV = cui$('cui-pPrix').value; const prix = prixV === '' ? null : parseFloat(prixV.replace(',', '.'));
  const data = { nom, unite: cui$('cui-pUnite').value.trim() || 'Pièce(s)', prix, categorie_id: cui$('cui-pCat').value || null, reference: cui$('cui-pRef').value.trim() || null, conditionnement: cui$('cui-pCond').value.trim() || null, stock_mini: cui$('cui-pMin').value === '' ? null : parseFloat(cui$('cui-pMin').value), poids_kg: cui$('cui-pPoids').value === '' ? null : parseFloat(cui$('cui-pPoids').value.replace(',', '.')), updated_at: new Date().toISOString() };
  try {
    if (id) {
      const old = CUI.prods.find(x => x.id === id);
      const priceChanged = prix != null && Number(old.prix) !== prix;
      const [row] = await cuiPATCH('cmd_produits?id=eq.' + id, data); Object.assign(old, row);
      if (priceChanged) await cuiPOST('cmd_prix_historique', { produit_id: id, prix, source: 'manuel' });
    } else {
      const [row] = await cuiPOST('cmd_produits', { ...data, fournisseur_id: CUI.supId, ordre: CUI.prods.filter(p => p.fournisseur_id === CUI.supId).length });
      CUI.prods.push(row);
      if (prix != null) await cuiPOST('cmd_prix_historique', { produit_id: row.id, prix, source: 'manuel' });
    }
    cuiCloseModal(); cuiRenderProducts(); cuiToast('Produit enregistré');
  } catch (e) { console.error(e); cuiToast('Erreur'); }
}
async function cuiArchiveProd(id) {
  if (!confirm('Retirer ce produit de la liste ?')) return;
  CUI.prods = CUI.prods.filter(p => p.id !== id); cuiCloseModal(); cuiRenderProducts();
  await cuiPATCH('cmd_produits?id=eq.' + id, { actif: false }).catch(() => cuiToast('Erreur'));
}

/* ─── Catégories ─── */
function cuiOpenCats() {
  const cats = cuiSupCats();
  cuiModal('Catégories', cats.map(c => `<div class="order-line" style="gap:8px;align-items:center"><input class="settings-field" value="${cuiEsc(c.nom)}" onchange="cuiRenameCat('${c.id}',this.value)"><button class="btn-icon" onclick="cuiDeleteCat('${c.id}')" style="color:var(--danger)">✕</button></div>`).join('') +
    `<div class="order-line" style="gap:8px;align-items:center"><input class="settings-field" id="cui-newCat" placeholder="Nouvelle catégorie"><button class="btn-icon" onclick="cuiAddCat()" style="background:var(--orange);color:#fff">＋</button></div>
    <div class="modal-actions"><button class="btn-close" onclick="cuiCloseModal();cuiRenderChips();cuiRenderProducts()">Fermer</button></div>`);
}
async function cuiAddCat() {
  const nom = cui$('cui-newCat').value.trim(); if (!nom) return;
  const [row] = await cuiPOST('cmd_categories', { fournisseur_id: CUI.supId, nom, ordre: cuiSupCats().length }).catch(() => [null]);
  if (row) { CUI.cats.push(row); cuiOpenCats(); }
}
async function cuiRenameCat(id, nom) { nom = nom.trim(); if (!nom) return; CUI.cats.find(c => c.id === id).nom = nom; await cuiPATCH('cmd_categories?id=eq.' + id, { nom }).catch(() => cuiToast('Erreur')); }
async function cuiDeleteCat(id) {
  if (!confirm('Supprimer la catégorie ? Les produits passent en "Sans catégorie".')) return;
  CUI.cats = CUI.cats.filter(c => c.id !== id); CUI.prods.forEach(p => { if (p.categorie_id === id) p.categorie_id = null; });
  if (CUI.cat === id) CUI.cat = 'all';
  cuiOpenCats(); await cuiDEL('cmd_categories?id=eq.' + id).catch(() => cuiToast('Erreur'));
}

/* ─── Fournisseur : ajout / édition ─── */
function cuiOpenSupEdit(isNew) {
  const s = isNew ? { delai_livraison_jours: 2 } : cuiSup(CUI.supId);
  cuiModal(isNew ? 'Nouveau fournisseur' : 'Fournisseur', `
    <div class="form-2col"><div class="form-row"><label>Nom</label><input id="cui-sNom" value="${cuiEsc(s.nom || '')}"></div><div class="form-row"><label>Emoji</label><input id="cui-sEmoji" value="${cuiEsc(s.emoji || '')}" placeholder="📦"></div></div>
    <div class="form-2col"><div class="form-row"><label>E-mail commandes</label><input id="cui-sEmail" type="email" value="${cuiEsc(s.email || '')}"></div><div class="form-row"><label>Copie (cc)</label><input id="cui-sCc" type="email" value="${cuiEsc(s.email_cc || '')}"></div></div>
    <div class="form-2col"><div class="form-row"><label>Téléphone</label><input id="cui-sTel" type="tel" value="${cuiEsc(s.telephone || '')}"></div><div class="form-row"><label>N° client</label><input id="cui-sNum" value="${cuiEsc(s.numero_client || '')}"></div></div>
    <div class="form-2col"><div class="form-row"><label>Commande par</label><select id="cui-sMode">${[['mail', 'E-mail'], ['sms', 'SMS (au téléphone ci-dessus)'], ['appel', 'Appel téléphonique']].map(([v, l]) => `<option value="${v}" ${(s.mode_commande || 'mail') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="form-row"><label>SMS copie (n°)</label><input id="cui-sSmsCc" type="tel" value="${cuiEsc(s.sms_copie_tel || '')}" placeholder="06 …"></div></div>
    <div class="form-2col"><div class="form-row"><label>Jours de commande (texte)</label><input id="cui-sJours" value="${cuiEsc(s.jours_commande || '')}" placeholder="ex : dim. pour mar."></div><div class="form-row"><label>Délai livraison (jours)</label><input id="cui-sDelai" type="number" min="0" value="${s.delai_livraison_jours ?? 1}"></div></div>
    <div class="form-row"><label>Rappel « à commander aujourd'hui » les</label><div style="display:flex;gap:6px;flex-wrap:wrap">${[1, 2, 3, 4, 5, 6, 0].map(j => `<button type="button" class="cui-chip cui-sRappel ${(s.rappel_jours || []).includes(j) ? 'on' : ''}" data-j="${j}" onclick="this.classList.toggle('on')">${CUI_JOURS[j].slice(0, 3)}</button>`).join('')}</div></div>
    <div class="form-2col"><div class="form-row"><label>Commercial</label><input id="cui-sComNom" value="${cuiEsc(s.commercial_nom || '')}" placeholder="Prénom Nom"></div><div class="form-row"><label>Portable commercial (SMS)</label><input id="cui-sComTel" type="tel" value="${cuiEsc(s.commercial_tel || '')}" placeholder="06 …"></div></div>
    <div class="form-row"><label>Notes</label><input id="cui-sNotes" value="${cuiEsc(s.notes || '')}"></div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="cuiSaveSup(${!!isNew})">Enregistrer</button>
      ${isNew ? '' : `<button class="btn-close" style="color:var(--danger)" onclick="cuiArchiveSup()">Masquer ce fournisseur</button>`}
      <button class="btn-close" onclick="cuiCloseModal()">Annuler</button>
    </div>`);
}
async function cuiSaveSup(isNew) {
  const nom = cui$('cui-sNom').value.trim(); if (!nom) { cuiToast('Nom obligatoire'); return; }
  const data = { nom, emoji: cui$('cui-sEmoji').value.trim() || null, email: cui$('cui-sEmail').value.trim() || null, email_cc: cui$('cui-sCc').value.trim() || null, mode_commande: cui$('cui-sMode').value, sms_copie_tel: cui$('cui-sSmsCc').value.trim() || null, telephone: cui$('cui-sTel').value.trim() || null, numero_client: cui$('cui-sNum').value.trim() || null, jours_commande: cui$('cui-sJours').value.trim() || null, rappel_jours: [...document.querySelectorAll('.cui-sRappel.on')].map(b => +b.dataset.j), delai_livraison_jours: parseInt(cui$('cui-sDelai').value) || 0, commercial_nom: cui$('cui-sComNom').value.trim() || null, commercial_tel: cui$('cui-sComTel').value.trim() || null, notes: cui$('cui-sNotes').value.trim() || null };
  try {
    if (isNew) { const [row] = await cuiPOST('cmd_fournisseurs', { ...data, ordre: CUI.sups.length }); CUI.sups.push(row); cuiCloseModal(); cuiShowSup(row.id); }
    else { const [row] = await cuiPATCH('cmd_fournisseurs?id=eq.' + CUI.supId, data); Object.assign(cuiSup(CUI.supId), row); cuiCloseModal(); cuiShowSup(CUI.supId); }
    cuiToast('Enregistré');
  } catch (e) { console.error(e); cuiToast('Erreur'); }
}
async function cuiArchiveSup() {
  if (!confirm('Masquer ce fournisseur de l\'accueil ?')) return;
  cuiSup(CUI.supId).actif = false; cuiCloseModal(); cuiShowHome();
  await cuiPATCH('cmd_fournisseurs?id=eq.' + CUI.supId, { actif: false }).catch(() => cuiToast('Erreur'));
}

/* ─── Modal ─── */
function cuiModal(title, body) {
  cui$('cui-modal').innerHTML = `<div class="modal-handle"></div><div class="modal-title">${title}</div>${body}`;
  cui$('overlay-cuisine').classList.add('open');
}
function cuiCloseModal() { cui$('overlay-cuisine').classList.remove('open'); }
cui$('overlay-cuisine').addEventListener('click', e => { if (e.target === cui$('overlay-cuisine')) cuiCloseModal(); });
