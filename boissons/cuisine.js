/* ═══════════════ CUISINE — commandes fournisseurs (tables Supabase cmd_*) ═══════════════
   Onglet "Cuisine" de l'app Boissons. Toutes les fonctions sont préfixées cui pour ne pas
   entrer en collision avec celles du bar (setQty, save, fmt…). Le panier est un brouillon
   partagé en base : ce qu'on coche sur la tablette apparaît sur le téléphone. */

const CUI = { sups: [], cats: [], prods: [], drafts: [], orders: [], supId: null, cat: 'all', loaded: false };
const CUI_UNITES = ['Kilo(s)', 'Pièce(s)', 'Carton(s)', 'Boîte(s)', 'Bouteille(s)', 'Sac(s)', 'Colis', 'Seau', 'Bidon', 'Litre(s)', 'Lot(s)', 'Sachet', 'Filet', 'Barquette(s)', 'Plateau(x)'];

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
const cuiLineTotal = l => (l.prix != null && l.quantite) ? l.prix * l.quantite : null;
const cuiOrderTotal = o => (o.lignes || []).reduce((a, l) => a + (cuiLineTotal(l) || 0), 0);
const cuiStatus = s => ({ brouillon: 'Brouillon', envoyee: 'Envoyée', confirmee: 'Confirmée', livree: 'Livrée', annulee: 'Annulée' }[s] || s);

/* ─── Chargement ─── */
async function cuiLoad(silent) {
  try {
    const [sups, cats, prods, drafts, orders] = await Promise.all([
      cuiGET('cmd_fournisseurs?order=ordre,nom'),
      cuiGET('cmd_categories?order=ordre,nom'),
      cuiGET('cmd_produits?actif=eq.true&order=ordre,nom'),
      cuiGET('cmd_commandes?statut=eq.brouillon&select=*,lignes:cmd_commande_lignes(*)'),
      cuiGET('cmd_commandes?statut=neq.brouillon&select=*,lignes:cmd_commande_lignes(*)&order=date_commande.desc&limit=200'),
    ]);
    Object.assign(CUI, { sups, cats, prods, drafts, orders, loaded: true });
    cuiRender();
  } catch (e) { console.error(e); if (!silent) cuiToast('Cuisine : erreur de connexion'); }
}
function cuiRender() {
  if (!CUI.loaded) return;
  if (CUI.supId && !cui$('cui-sup').classList.contains('hidden')) { cuiRenderChips(); cuiRenderProducts(); cuiRenderBar(); }
  else if (!cui$('cui-hist').classList.contains('hidden')) cuiRenderHistory();
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
  cui$('cui-home').classList.remove('hidden'); cui$('cui-sup').classList.add('hidden'); cui$('cui-hist').classList.add('hidden');
  CUI.supId = null; cuiRenderHome(); cuiRenderBar();
}
function cuiRenderHome() {
  cui$('cui-grid').innerHTML = CUI.sups.filter(s => s.actif !== false).map(s => {
    const d = cuiDraftFor(s.id); const n = d ? d.lignes.length : 0;
    const last = CUI.orders.find(o => o.fournisseur_id === s.id);
    const np = CUI.prods.filter(p => p.fournisseur_id === s.id).length;
    return `<button class="cui-card" onclick="cuiShowSup('${s.id}')">
      ${n ? `<span class="cui-badge">${n}</span>` : ''}
      <div class="cui-card-emoji">${s.emoji || '📦'}</div>
      <div class="cui-card-name">${cuiEsc(s.nom)}</div>
      <div class="cui-card-meta">${np} produit${np > 1 ? 's' : ''}${last ? ' · ' + cuiD(last.date_commande) : ''}${s.jours_commande ? '<br>⏰ ' + cuiEsc(s.jours_commande) : ''}</div>
    </button>`;
  }).join('') + `<button class="cui-card cui-card-add" onclick="cuiOpenSupEdit(true)">＋ Fournisseur</button>`;
  cui$('cui-orders').innerHTML = CUI.orders.slice(0, 6).map(cuiOrderRow).join('') || '<div class="empty-state">Aucune commande pour l\'instant.</div>';
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
  cui$('cui-sup-sub').textContent = [s.jours_commande, s.email, s.telephone].filter(Boolean).join(' · ');
  const d = cuiDraftFor(id); cui$('cui-note').value = d && d.note ? d.note : '';
  cui$('cui-home').classList.add('hidden'); cui$('cui-hist').classList.add('hidden'); cui$('cui-sup').classList.remove('hidden');
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
  const q = cui$('cui-search').value.trim().toLowerCase();
  const d = cuiDraftFor(CUI.supId); const inCart = {}; (d ? d.lignes : []).forEach(l => inCart[l.produit_id] = l);
  let prods = CUI.prods.filter(p => p.fournisseur_id === CUI.supId);
  if (q) prods = prods.filter(p => (p.nom + ' ' + (p.reference || '') + ' ' + (p.marque || '')).toLowerCase().includes(q));
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
function cuiOrderText(o) {
  const s = cuiSup(o.fournisseur_id) || {};
  const lines = o.lignes.map(l => `• ${cuiQty(l.quantite)} ${l.unite || ''} — ${l.nom}${l.reference ? ' (réf. ' + l.reference + ')' : ''}`).join('\n');
  const liv = new Date(o.date_livraison).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return `Bonjour,\n\nCommande Braise & Co Biganos${s.numero_client ? ' (client ' + s.numero_client + ')' : ''}\nN° ${o.numero} — livraison souhaitée le ${liv}\n\n${lines}\n${o.note ? '\nNote : ' + o.note + '\n' : ''}\nMerci,\n${o.commande_par || ''} — Braise & Co\n174 av. de la Côte d'Argent, 33380 Biganos`;
}
// Un SMS ne part que vers un portable ; un standard (05, 02, 09) ne le recevrait pas
function cuiIsMobile(tel) { return /^(\+33\s?|0)[67]/.test((tel || '').replace(/[\s.-]/g, '')); }
function cuiOrderById(id) { return CUI.orders.find(x => x.id === id) || CUI._pending; }
function cuiSendSms(id) {
  const o = cuiOrderById(id); const s = cuiSup(o.fournisseur_id) || {};
  ouvrirSms(s.telephone, cuiOrderText(o));
}
function cuiSendMail(id) {
  const o = cuiOrderById(id); const s = cuiSup(o.fournisseur_id) || {};
  window.location.href = buildMailtoUrl(s.email, `Commande Braise & Co ${o.numero} — livraison ${cuiD(o.date_livraison)}`, cuiOrderText(o)) + (s.email_cc ? '&cc=' + encodeURIComponent(s.email_cc) : '');
}
function cuiSendButtons(o) {
  const s = cuiSup(o.fournisseur_id) || {};
  return `
    ${cuiIsMobile(s.telephone) ? `<div style="font-size:12px;color:var(--muted);margin-bottom:6px;font-weight:600">SMS · ${cuiEsc(s.telephone)}</div><a class="btn-primary" href="#" onclick="event.preventDefault();cuiSendSms('${o.id}')">📨 SMS — ${cuiEsc(s.nom)}</a>` : ''}
    ${s.email ? `<div style="font-size:12px;color:var(--muted);margin:8px 0 6px;font-weight:600">Email · ${cuiEsc(s.email)}</div><a class="btn-primary" href="#" style="background:var(--surf3);color:var(--text)" onclick="event.preventDefault();cuiSendMail('${o.id}')">✉️ Email — ${cuiEsc(s.nom)}</a>` : ''}
    ${!cuiIsMobile(s.telephone) && !s.email ? '<div class="alert-banner" style="margin:0 0 8px">⚠️ Ni téléphone ni e-mail pour ce fournisseur — renseignez-les via ⚙️.</div>' : ''}
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
      <button class="btn-close" onclick="cuiValidate()">✓ Commande envoyée — terminer</button>
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
  const o = cuiOrderById(id);
  try { await navigator.clipboard.writeText(cuiOrderText(o)); cuiToast('📋 Commande copiée'); }
  catch { prompt('Copiez le texte :', cuiOrderText(o)); }
}

/* ─── Détail d'une commande passée ─── */
function cuiOpenOrder(id) {
  const o = CUI.orders.find(x => x.id === id); if (!o) return;
  const s = cuiSup(o.fournisseur_id) || {};
  cuiModal(`${s.emoji || ''} ${cuiEsc(s.nom)} · ${cuiEsc(o.numero || '')}`, `
    <div class="modal-section"><div class="cui-kv">
      <div><span>Statut</span><span class="cui-status ${o.statut}">${cuiStatus(o.statut)}</span></div><div><span>Livraison</span>${cuiD(o.date_livraison)}</div>
      <div><span>Commandé le</span>${cuiDT(o.date_commande)}</div><div><span>Par</span>${cuiEsc(o.commande_par || '—')}</div>
    </div>${o.note ? `<div style="margin-top:8px"><div class="ms-label">Note</div><div class="ms-val">${cuiEsc(o.note)}</div></div>` : ''}</div>
    <div class="modal-section"><div class="ms-label">Produits</div>
      ${o.lignes.map(l => `<div class="order-line"><span>${cuiEsc(l.nom)}<div class="prod-meta">${l.reference ? cuiEsc(l.reference) + ' · ' : ''}${l.prix != null ? cuiEur(l.prix) + ' / ' : ''}${cuiEsc(l.unite || '')}${cuiEcartHtml(l)}</div></span><span class="order-line-qty">${cuiQty(l.quantite)} ${cuiEsc(l.unite || '')}${cuiLineTotal(l) != null ? ' · ' + cuiEur(cuiLineTotal(l)) : ''}</span></div>`).join('')}
    </div>
    ${o.date_reception ? `<div class="modal-section"><div class="ms-label">Réception</div><div class="ms-val">${cuiDT(o.date_reception)}${o.recu_par ? ' par ' + cuiEsc(o.recu_par) : ''}${o.numero_bl ? ' · BL ' + cuiEsc(o.numero_bl) : ''}<br>${cuiEcarts(o).length ? '<span style="color:var(--danger)">⚠️ ' + cuiEcarts(o).length + ' écart' + (cuiEcarts(o).length > 1 ? 's' : '') + '</span>' : '<span style="color:var(--ok)">✓ Conforme</span>'}${o.reception_note ? '<br>' + cuiEsc(o.reception_note) : ''}</div>
      ${cuiEcarts(o).length ? `<button class="btn-secondary" style="margin-top:8px" onclick="cuiOpenReclamation('${o.id}')">📣 Réclamation fournisseur</button>` : ''}</div>` : ''}
    <div class="modal-section"><div class="ms-label">Montant HT estimé</div><div class="ms-val">${cuiEur(cuiOrderTotal(o)) || '—'}</div></div>
    <div class="modal-actions">
      <div class="cui-row-btns">
        ${o.statut === 'envoyee' ? `<button class="btn-secondary" onclick="cuiSetStatus('${o.id}','confirmee')">✓ Confirmée</button>` : ''}
        ${o.statut !== 'annulee' ? `<button class="btn-secondary" style="${o.date_reception ? '' : 'background:var(--orange);color:#fff'}" onclick="cuiOpenReception('${o.id}')">📦 ${o.date_reception ? 'Modifier la réception' : 'Réceptionner'}</button>` : ''}
        <button class="btn-secondary" onclick="cuiReorder('${o.id}')">↻ Recommander</button>
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
function cuiEcarts(o) { return o.lignes.filter(l => l.qte_recue != null && (Number(l.qte_recue) !== Number(l.quantite) || l.ecart)); }
function cuiEcartHtml(l) {
  if (l.qte_recue == null) return '';
  const diff = Number(l.qte_recue) - Number(l.quantite);
  if (!diff && !l.ecart) return ' · <span style="color:var(--ok)">✓ reçu</span>';
  return ` · <span style="color:var(--danger)">${diff ? 'reçu ' + cuiQty(l.qte_recue) + ' / ' + cuiQty(l.quantite) : ''}${diff && l.ecart ? ' · ' : ''}${l.ecart ? cuiEsc(l.ecart) : ''}</span>`;
}
function cuiOpenReception(id) {
  const o = CUI.orders.find(x => x.id === id); if (!o) return;
  const s = cuiSup(o.fournisseur_id) || {};
  CUI._rec = { id, lines: o.lignes.map(l => ({ id: l.id, nom: l.nom, unite: l.unite, quantite: Number(l.quantite), qte_recue: l.qte_recue != null ? Number(l.qte_recue) : Number(l.quantite), ecart: l.ecart || '' })) };
  cuiModal(`📦 Réception · ${cuiEsc(s.nom)}`, `
    <div class="prod-meta" style="margin-bottom:10px">Commande ${cuiEsc(o.numero || '')} · livraison prévue ${cuiD(o.date_livraison)}. Comparez avec le bon de livraison : corrigez les quantités reçues, signalez un problème.</div>
    <div class="form-2col">
      <div class="form-row"><label>N° du BL (facultatif)</label><input id="cui-r-bl" value="${cuiEsc(o.numero_bl || '')}"></div>
      <div class="form-row"><label>Réceptionné par</label><input id="cui-r-who" value="${cuiEsc(o.recu_par || cuiWho())}"></div>
    </div>
    <div class="modal-section" id="cui-r-lines">${CUI._rec.lines.map(cuiRecLine).join('')}</div>
    <div class="form-row"><label>Remarque</label><input id="cui-r-note" value="${cuiEsc(o.reception_note || '')}" placeholder="ex : colis ouvert, chauffeur prévenu"></div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="cuiSaveReception()">✓ Valider la réception</button>
      <button class="btn-secondary" onclick="cuiRecAllOk()">Tout est conforme</button>
      <button class="btn-close" onclick="cuiOpenOrder('${id}')">Annuler</button>
    </div>`);
}
function cuiRecLine(l, i) {
  const bad = l.qte_recue !== l.quantite || l.ecart;
  return `<div class="order-line" style="flex-direction:column;align-items:stretch;gap:6px;padding:9px 0" id="cui-rl-${i}">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="flex:1;${bad ? 'color:var(--danger)' : ''}">${cuiEsc(l.nom)}<div class="prod-meta">commandé : <b>${cuiQty(l.quantite)} ${cuiEsc(l.unite || '')}</b></div></span>
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
function cuiReclamationSms(id) { const o = CUI.orders.find(x => x.id === id); ouvrirSms((cuiSup(o.fournisseur_id) || {}).telephone, cuiReclamationText(o)); }
function cuiReclamationMail(id) {
  const o = CUI.orders.find(x => x.id === id); const s = cuiSup(o.fournisseur_id) || {};
  window.location.href = buildMailtoUrl(s.email, `Réclamation livraison ${o.numero_bl ? 'BL ' + o.numero_bl : o.numero} — Braise & Co`, cuiReclamationText(o)) + (s.email_cc ? '&cc=' + encodeURIComponent(s.email_cc) : '');
}
function cuiReclamationCopy(id) { navigator.clipboard.writeText(cuiReclamationText(CUI.orders.find(x => x.id === id))).then(() => cuiToast('📋 Copié')); }
function cuiOpenReclamation(id) {
  const o = CUI.orders.find(x => x.id === id); const s = cuiSup(o.fournisseur_id) || {};
  cuiModal(`📣 Réclamation · ${cuiEsc(s.nom)}`, `
    <div class="modal-section"><div class="ms-label">Message</div><div class="ms-val" style="font-size:13px">${cuiEsc(cuiReclamationText(o))}</div></div>
    <div class="modal-actions">
      ${cuiIsMobile(s.telephone) ? `<a class="btn-primary" href="#" onclick="event.preventDefault();cuiReclamationSms('${id}')">📨 SMS — ${cuiEsc(s.nom)}</a>` : ''}
      ${s.email ? `<a class="btn-primary" href="#" style="background:var(--surf3);color:var(--text)" onclick="event.preventDefault();cuiReclamationMail('${id}')">✉️ Email — ${cuiEsc(s.nom)}</a>` : ''}
      <button class="btn-secondary" onclick="cuiReclamationCopy('${id}')">📋 Copier le texte</button>
      <button class="btn-close" onclick="cuiOpenOrder('${id}')">Retour à la commande</button>
    </div>`);
}

/* ─── Historique ─── */
function cuiOpenHistory() {
  cui$('cui-hist-sup').innerHTML = '<option value="">Tous les fournisseurs</option>' + CUI.sups.map(s => `<option value="${s.id}">${cuiEsc(s.nom)}</option>`).join('');
  cui$('cui-home').classList.add('hidden'); cui$('cui-sup').classList.add('hidden'); cui$('cui-hist').classList.remove('hidden');
  CUI.supId = null; cuiRenderBar(); cuiRenderHistory();
}
function cuiRenderHistory() {
  const f = cui$('cui-hist-sup').value;
  const list = CUI.orders.filter(o => !f || o.fournisseur_id === f);
  cui$('cui-hist-list').innerHTML = list.map(cuiOrderRow).join('') || '<div class="empty-state">Aucune commande.</div>';
}


/* ─── Récap achats par fournisseur (année / mois) ───
   Montants = prix de la mercuriale au moment de la commande, pas la facture. */
async function cuiOpenRecap(year) {
  year = year || new Date().getFullYear();
  cuiModal(`Achats ${year}`, '<div class="empty-state">Chargement…</div>');
  let rows;
  try {
    rows = await cuiGET(`cmd_commandes?statut=in.(envoyee,confirmee,livree)&date_commande=gte.${year}-01-01&date_commande=lt.${year + 1}-01-01&select=fournisseur_id,date_commande,lignes:cmd_commande_lignes(quantite,prix)`);
  } catch (e) { cuiModal(`Achats ${year}`, '<div class="empty-state">Erreur de connexion</div>'); return; }
  const bySup = {}, byMonth = {};
  let sansPrix = 0, total = 0;
  rows.forEach(o => {
    const t = cuiOrderTotal(o); total += t;
    sansPrix += o.lignes.filter(l => l.prix == null).length;
    const a = bySup[o.fournisseur_id] = bySup[o.fournisseur_id] || { n: 0, t: 0 }; a.n++; a.t += t;
    const m = new Date(o.date_commande).getMonth(); byMonth[m] = (byMonth[m] || 0) + t;
  });
  const mois = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const supRows = Object.entries(bySup).sort((a, b) => b[1].t - a[1].t).map(([id, a]) => {
    const s = cuiSup(id) || { nom: 'Fournisseur supprimé' };
    return `<div class="order-line"><span>${s.emoji || ''} ${cuiEsc(s.nom)}<div class="prod-meta">${a.n} commande${a.n > 1 ? 's' : ''}</div></span><span class="order-line-qty">${cuiEur(a.t)}</span></div>`;
  }).join('') || '<div class="prod-meta">Aucune commande cette année.</div>';
  const maxM = Math.max(1, ...Object.values(byMonth));
  const monthRows = mois.map((m, i) => `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0"><span style="width:34px;color:var(--muted)">${m}</span><div style="flex:1;height:8px;background:var(--surf3);border-radius:4px;overflow:hidden"><div style="width:${Math.round((byMonth[i] || 0) / maxM * 100)}%;height:100%;background:var(--orange)"></div></div><span style="width:74px;text-align:right">${byMonth[i] ? cuiEur(byMonth[i]) : ''}</span></div>`).join('');
  const y = new Date().getFullYear();
  cuiModal(`Achats ${year}`, `
    <div style="display:flex;gap:8px;margin-bottom:10px">${[y - 2, y - 1, y].map(k => `<button class="cui-chip ${k === year ? 'on' : ''}" onclick="cuiOpenRecap(${k})">${k}</button>`).join('')}</div>
    <div class="modal-section"><div class="ms-label">Total HT estimé</div><div class="ms-val" style="font-size:22px;font-weight:800;color:var(--orange)">${cuiEur(total)}</div>
      <div class="prod-meta">${rows.length} commande${rows.length > 1 ? 's' : ''}${sansPrix ? ` · ⚠️ ${sansPrix} ligne${sansPrix > 1 ? 's' : ''} sans prix (non comptée${sansPrix > 1 ? 's' : ''})` : ''}</div></div>
    <div class="modal-section"><div class="ms-label">Par fournisseur</div>${supRows}</div>
    <div class="modal-section"><div class="ms-label">Par mois</div>${monthRows}</div>
    <div class="modal-actions"><button class="btn-close" onclick="cuiCloseModal()">Fermer</button></div>`);
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
    <div class="form-2col">
      <div class="form-row"><label>Conditionnement</label><input id="cui-pCond" value="${cuiEsc(p.conditionnement || '')}" placeholder="ex : carton de 6"></div>
      <div class="form-row"><label>Stock mini</label><input id="cui-pMin" type="number" step="0.5" inputmode="decimal" value="${p.stock_mini ?? ''}"></div>
    </div>
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
  const data = { nom, unite: cui$('cui-pUnite').value.trim() || 'Pièce(s)', prix, categorie_id: cui$('cui-pCat').value || null, reference: cui$('cui-pRef').value.trim() || null, conditionnement: cui$('cui-pCond').value.trim() || null, stock_mini: cui$('cui-pMin').value === '' ? null : parseFloat(cui$('cui-pMin').value), updated_at: new Date().toISOString() };
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
    <div class="form-2col"><div class="form-row"><label>Téléphone (SMS)</label><input id="cui-sTel" type="tel" value="${cuiEsc(s.telephone || '')}"></div><div class="form-row"><label>N° client</label><input id="cui-sNum" value="${cuiEsc(s.numero_client || '')}"></div></div>
    <div class="form-2col"><div class="form-row"><label>Jours de commande</label><input id="cui-sJours" value="${cuiEsc(s.jours_commande || '')}" placeholder="ex : dim. pour mar."></div><div class="form-row"><label>Délai livraison (jours)</label><input id="cui-sDelai" type="number" min="0" value="${s.delai_livraison_jours ?? 1}"></div></div>
    <div class="form-row"><label>Notes</label><input id="cui-sNotes" value="${cuiEsc(s.notes || '')}"></div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="cuiSaveSup(${!!isNew})">Enregistrer</button>
      ${isNew ? '' : `<button class="btn-close" style="color:var(--danger)" onclick="cuiArchiveSup()">Masquer ce fournisseur</button>`}
      <button class="btn-close" onclick="cuiCloseModal()">Annuler</button>
    </div>`);
}
async function cuiSaveSup(isNew) {
  const nom = cui$('cui-sNom').value.trim(); if (!nom) { cuiToast('Nom obligatoire'); return; }
  const data = { nom, emoji: cui$('cui-sEmoji').value.trim() || null, email: cui$('cui-sEmail').value.trim() || null, email_cc: cui$('cui-sCc').value.trim() || null, telephone: cui$('cui-sTel').value.trim() || null, numero_client: cui$('cui-sNum').value.trim() || null, jours_commande: cui$('cui-sJours').value.trim() || null, delai_livraison_jours: parseInt(cui$('cui-sDelai').value) || 0, notes: cui$('cui-sNotes').value.trim() || null };
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
