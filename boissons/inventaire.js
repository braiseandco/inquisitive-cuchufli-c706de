/* ═══════════════ INVENTAIRE VALORISÉ (espace patron) ═══════════════
   Stock compté × prix catalogue (cmd_produits), par fournisseur, PDF à la charte maison.
   Le comptage en cours est en base (cmd_inventaires, statut en_cours) : on peut compter sur
   plusieurs appareils ou en plusieurs fois. lignes = { produit_id: { q, p } }, p = prix saisi
   à la main quand le catalogue n'en a pas (ou pour le corriger). */

const INV = { row: null, sup: 'all', timer: null };

// Le Bihan : fûts au prix du litre, cartons au prix de la bouteille → on compte dans l'unité du prix
function invUnite(p) {
  const c = (p.conditionnement || '').toLowerCase();
  if (c.includes('prix au litre')) return 'L';
  if (c.includes('prix à la bouteille')) return 'bouteille(s)';
  return p.unite || '';
}
function invProds() {
  const ordreCat = id => (CUI.cats.find(c => c.id === id) || {}).ordre ?? 999;
  return CUI.prods.filter(p => p.fournisseur_id)
    .sort((a, b) => ordreCat(a.categorie_id) - ordreCat(b.categorie_id) || (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom));
}
function invSups() {
  const ids = new Set(CUI.prods.map(p => p.fournisseur_id));
  return CUI.sups.filter(s => ids.has(s.id)).sort((a, b) => a.nom.localeCompare(b.nom));
}
const invLigne = id => INV.row.lignes[id] || {};
const invPrix = p => { const l = invLigne(p.id); return l.p != null ? l.p : (p.prix != null ? +p.prix : null); };
const invValeur = p => { const q = invLigne(p.id).q, pr = invPrix(p); return q && pr != null ? q * pr : 0; };
const invValTxt = p => invLigne(p.id).q && invPrix(p) != null ? '= ' + cuiEur(invValeur(p)) : '';
const invTotal = prods => prods.reduce((t, p) => t + invValeur(p), 0);
const invDuSup = id => invProds().filter(p => p.fournisseur_id === id);

async function invShow() {
  cuiCloseModal(); switchTab('cuisine');
  if (!CUI.loaded) await cuiLoad(true);
  try {
    const r = await cuiGET('cmd_inventaires?statut=eq.en_cours&order=created_at.desc&limit=1');
    INV.row = r[0] || (await cuiPOST('cmd_inventaires', {}))[0];
  } catch (e) { console.error(e); return cuiToast('Inventaire : erreur de connexion'); }
  ['cui-home', 'cui-sup', 'cui-hist', 'cui-fact'].forEach(id => cui$(id).classList.add('hidden'));
  cui$('cui-inv').classList.remove('hidden');
  CUI.supId = null; cuiRenderBar(); invRender();
}
function invHide() { cui$('cui-inv').classList.add('hidden'); cuiShowHome(); }

function invRender() {
  cui$('cui-inv-date').value = INV.row.date_inventaire;
  const all = invProds(), sups = invSups(), q = cuiNorm(cui$('cui-inv-search').value);
  cui$('cui-inv-chips').innerHTML = [{ id: 'all', nom: 'Tous' }, ...sups].map(s => {
    const ps = s.id === 'all' ? all : all.filter(p => p.fournisseur_id === s.id);
    const n = ps.filter(p => invLigne(p.id).q != null).length;
    return `<button class="cui-chip ${INV.sup === s.id ? 'on' : ''}" onclick="INV.sup='${s.id}';invRender()">${cuiEsc(s.nom)} · ${n}/${ps.length}</button>`;
  }).join('');
  let prods = INV.sup === 'all' ? all : all.filter(p => p.fournisseur_id === INV.sup);
  if (q) prods = prods.filter(p => cuiNorm(p.nom + ' ' + (p.reference || '')).includes(q));
  cui$('cui-inv-list').innerHTML = sups.filter(s => prods.some(p => p.fournisseur_id === s.id)).map(s =>
    `<div class="cat-label" style="display:flex;justify-content:space-between">${cuiEsc(s.nom)}<span id="inv-st-${s.id}">${cuiEur(invTotal(invDuSup(s.id)))}</span></div>` +
    prods.filter(p => p.fournisseur_id === s.id).map(invRow).join('')
  ).join('') || '<div class="empty-state">Aucun produit ne correspond.</div>';
  invRenderTotal();
}
function invRow(p) {
  const l = invLigne(p.id), pr = invPrix(p), u = cuiEsc(invUnite(p));
  const prix = pr != null ? `<span onclick="invEditPrix('${p.id}')" style="text-decoration:underline dotted;cursor:pointer">${cuiEur(pr)} / ${u}</span>` : '<span style="color:var(--warn)">prix manquant</span>';
  return `<div class="prod-row ${l.q ? 'has-qty' : ''}" id="inv-r-${p.id}">
    <div class="prod-info"><div class="prod-name">${cuiEsc(p.nom)}</div>
      <div class="prod-meta">${p.conditionnement ? cuiEsc(p.conditionnement) + ' · ' : ''}${prix} <b id="inv-v-${p.id}" style="color:var(--text)">${invValTxt(p)}</b></div></div>
    ${pr == null || l.p != null ? `<input class="inv-in" type="number" min="0" step="any" inputmode="decimal" placeholder="prix €" value="${l.p ?? ''}" onchange="invSet('${p.id}','p',this.value)">` : ''}
    <div style="text-align:center"><input class="inv-in" type="number" min="0" step="any" inputmode="decimal" placeholder="0" value="${l.q ?? ''}" oninput="invSet('${p.id}','q',this.value)"><div class="inv-u">${u}</div></div>
  </div>`;
}
function invEditPrix(id) {
  const p = CUI.prods.find(x => x.id === id);
  (INV.row.lignes[id] = INV.row.lignes[id] || {}).p = invPrix(p);
  cui$('inv-r-' + id).outerHTML = invRow(p);
  cui$('inv-r-' + id).querySelector('.inv-in').focus();
}
function invSet(id, k, v) {
  const l = INV.row.lignes[id] = INV.row.lignes[id] || {};
  const n = parseFloat(String(v).replace(',', '.'));
  if (isNaN(n)) delete l[k]; else l[k] = n;
  if (l.q == null && l.p == null) delete INV.row.lignes[id];
  const p = CUI.prods.find(x => x.id === id);
  if (k === 'p') cui$('inv-r-' + id).outerHTML = invRow(p);
  else { cui$('inv-r-' + id).classList.toggle('has-qty', !!l.q); cui$('inv-v-' + id).textContent = invValTxt(p); }
  const st = cui$('inv-st-' + p.fournisseur_id); if (st) st.textContent = cuiEur(invTotal(invDuSup(p.fournisseur_id)));
  invRenderTotal(); invSave();
}
function invSetDate(v) { if (v) { INV.row.date_inventaire = v; invSave(); } }
function invRenderTotal() {
  const all = invProds(), n = all.filter(p => invLigne(p.id).q).length;
  cui$('cui-inv-total').textContent = `${n} produit${n > 1 ? 's' : ''} · ${cuiEur(invTotal(all)) || '0,00 €'} HT`;
}
function invSave() {
  clearTimeout(INV.timer);
  INV.timer = setTimeout(() => cuiPATCH('cmd_inventaires?id=eq.' + INV.row.id,
    { lignes: INV.row.lignes, date_inventaire: INV.row.date_inventaire, total_ht: Math.round(invTotal(invProds()) * 100) / 100, updated_at: new Date().toISOString() })
    .catch(() => cuiToast('Inventaire non enregistré — vérifiez la connexion')), 700);
}
async function invCloturer() {
  if (!confirm('Clôturer cet inventaire ? Le prochain repartira de zéro.')) return;
  clearTimeout(INV.timer);
  try {
    await cuiPATCH('cmd_inventaires?id=eq.' + INV.row.id, { lignes: INV.row.lignes, date_inventaire: INV.row.date_inventaire, statut: 'cloture', total_ht: Math.round(invTotal(invProds()) * 100) / 100 });
    cuiToast('Inventaire clôturé'); invHide();
  } catch (e) { cuiToast('Erreur de connexion'); }
}

/* ─── PDF ─── */
async function invPdf() {
  const all = invProds(), total = invTotal(all);
  const blocs = invSups().map(s => ({ s, ps: all.filter(p => p.fournisseur_id === s.id && invLigne(p.id).q) })).filter(b => b.ps.length);
  if (!blocs.length) return cuiToast('Aucun stock renseigné');
  const date = new Date(INV.row.date_inventaire + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const titre = 'Inventaire au ' + date;
  const sansPrix = all.filter(p => invLigne(p.id).q && invPrix(p) == null).length;
  const eur = n => cuiEur(n).replace(/ | /g, ' ');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; } body { margin: 0; width: 718px; font-family: "Segoe UI", Arial, sans-serif; font-size: 8.5pt; color: #222; background: #fff; }
    .head { display: flex; justify-content: space-between; align-items: center; padding-bottom: 9px; border-bottom: 1.6px solid #ff6b00; }
    .head img { width: 72px; } .co { text-align: right; font-size: 8.3pt; color: #555; line-height: 1.6; } .co b { color: #222; }
    .eyebrow { text-align: center; color: #ff6b00; font-weight: 700; font-size: 7.8pt; letter-spacing: .32em; margin: 8px 0 0; }
    h1 { text-align: center; font-size: 20pt; margin: 0; } .sub { text-align: center; font-size: 8.3pt; color: #555; margin: 1px 0 10px; }
    .objet { border-left: 3px solid #ff6b00; background: #fff6ef; padding: 7px 11px; margin: 0 0 10px; font-size: 10pt; display: flex; justify-content: space-between; }
    .objet span { color: #ff6b00; font-weight: 700; font-size: 7.8pt; letter-spacing: .22em; } .objet b { font-size: 12pt; }
    h2 { font-size: 10pt; margin: 12px 0 4px; padding-bottom: 3px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; }
    h2 small { color: #ff6b00; font-size: 7.8pt; letter-spacing: .22em; margin-right: 8px; }
    table { width: 100%; border-collapse: collapse; } th { text-align: left; font-size: 7.3pt; color: #777; font-weight: 600; letter-spacing: .05em; padding: 3px 4px; border-bottom: 1px solid #ddd; }
    td { padding: 3px 4px; border-bottom: 1px solid #f0f0f0; vertical-align: top; } tr { page-break-inside: avoid; }
    .r { text-align: right; white-space: nowrap; } .m { color: #888; font-size: 7.5pt; } .tot td { font-weight: 700; border-top: 1px solid #ccc; border-bottom: 0; }
    .warn { color: #c25400; }
  </style></head><body>
    <div class="head"><img src="${location.origin}/boissons/logo-doc.png" alt="Braise &amp; Co"><div class="co"><b>ARP BIGANOS</b> · Restaurant Braise &amp; Co<br>174 Avenue de la Côte d'Argent<br>33380 BIGANOS<br>SIRET 81990125700017 · APE 5610A</div></div>
    <div class="eyebrow">INVENTAIRE DES STOCKS</div><h1>${cuiEsc(titre)}</h1>
    <div class="sub">Valorisation au prix d'achat HT · Biganos, le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    <div class="objet"><div><span>VALEUR DU STOCK</span>&nbsp; ${blocs.length} fournisseur${blocs.length > 1 ? 's' : ''}</div><b>${eur(total)} HT</b></div>
    <table><tr><th>Fournisseur</th><th class="r">Produits</th><th class="r">Valeur HT</th></tr>
      ${blocs.map(b => `<tr><td>${cuiEsc(b.s.nom)}</td><td class="r">${b.ps.length}</td><td class="r">${eur(invTotal(b.ps))}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="r">${blocs.reduce((n, b) => n + b.ps.length, 0)}</td><td class="r">${eur(total)}</td></tr></table>
    ${sansPrix ? `<p class="warn">${sansPrix} produit${sansPrix > 1 ? 's' : ''} compté${sansPrix > 1 ? 's' : ''} sans prix : non valorisé${sansPrix > 1 ? 's' : ''}.</p>` : ''}
    ${blocs.map((b, i) => `<h2><span><small>${String(i + 1).padStart(2, '0')}</small>${cuiEsc(b.s.nom)}</span><span>${eur(invTotal(b.ps))} HT</span></h2>
      <table><tr><th>Produit</th><th class="r">Quantité</th><th class="r">Prix unitaire HT</th><th class="r">Valeur HT</th></tr>
      ${b.ps.map(p => { const pr = invPrix(p); return `<tr><td>${cuiEsc(p.nom)}${p.conditionnement ? `<div class="m">${cuiEsc(p.conditionnement)}</div>` : ''}</td><td class="r">${cuiQty(invLigne(p.id).q)} ${cuiEsc(invUnite(p))}</td><td class="r">${pr != null ? eur(pr) : '<span class="warn">—</span>'}</td><td class="r">${pr != null ? eur(invValeur(p)) : ''}</td></tr>`; }).join('')}
      <tr class="tot"><td colspan="3">Sous-total ${cuiEsc(b.s.nom)}</td><td class="r">${eur(invTotal(b.ps))}</td></tr></table>`).join('')}
  </body></html>`;

  cuiToast('Création du PDF…');
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;left:-10000px;top:0;width:740px;height:1100px;border:0';
  document.body.appendChild(f);
  try {
    const doc = f.contentDocument; doc.open(); doc.write(html); doc.close();
    await new Promise((ok, ko) => {
      const s = doc.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.14.0/dist/html2pdf.bundle.min.js';
      s.onload = ok; s.onerror = () => ko(new Error('bibliothèque PDF injoignable'));
      doc.head.appendChild(s);
    });
    await Promise.all([...doc.images].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
    // Options recréées dans le cadre : html2pdf teste « instanceof Array », faux pour un tableau de la page parente
    const opts = f.contentWindow.JSON.parse(JSON.stringify({
      margin: [10, 10, 14, 10], image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2 },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'h2'] }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }));
    const blob = await f.contentWindow.html2pdf().set(opts).from(doc.body).toPdf().get('pdf').then(pdf => {
      const n = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= n; i++) {
        pdf.setPage(i); pdf.setFontSize(7.5); pdf.setTextColor(52);
        pdf.text('ARP BIGANOS · ' + titre, 10, 289); pdf.text(`Page ${i} / ${n}`, 200, 289, { align: 'right' });
      }
    }).outputPdf('blob');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `inventaire-${INV.row.date_inventaire}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    cuiToast('PDF créé'); invSave();
  } catch (e) { console.error(e); cuiToast('PDF non créé : ' + e.message); }
  finally { setTimeout(() => f.remove(), 1000); }
}
