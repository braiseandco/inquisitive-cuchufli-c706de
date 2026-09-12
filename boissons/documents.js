/* ═══════════════ DOCUMENTS FOURNISSEURS — BL, accusés de réception, confirmations ═══════════════
   Le script d'import range aussi les bons de livraison (Blason d'Or, YesFood), les accusés de
   réception de commande (Lodifrais) et les confirmations de commande (Blason d'Or) reçus par mail,
   avec type = bl | arc | confirmation dans cmd_factures. Ici on les lit (pdf.js) et on s'en sert :
   - BL → n° de BL et quantités livrées posés sur la commande (réception pré-remplie) ;
   - accusé / confirmation → commande passée en "confirmée", prix du jour repris ;
   - aucune commande dans l'appli (commande téléphonée, WhatsApp…) → la commande est créée.
   S'appuie sur cuisine.js (CUI, cui*) et factures.js (FAC, fac*). Préfixe doc*. */

const DOC_TYPES = { bl: 'Bon de livraison', arc: 'Accusé de réception', confirmation: 'Confirmation de commande' };

/* ─── Lecteurs : { numero, date, date_livraison, ref_commande, ht, lignes:[{ref,nom,qte,unite,pu,montant}] } ─── */
const DOC_PARSEURS = {
  bl_yesfood(L) {
    const r = { lignes: [] };
    L.forEach(t => {
      let m;
      if ((m = /BON LIVRAISON N[°º]\s*(\d+)/.exec(t))) r.numero = r.numero || m[1];
      if ((m = /^du (\d\d\/\d\d\/\d{4})/.exec(t))) r.date = r.date || facDate(m[1]);
      if ((m = /^(\d{8}) (\d\d\/\d\d\/\d{4}) \S+(?: (\d\d\/\d\d\/\d{4}))?$/.exec(t))) { r.ref_commande = r.ref_commande || m[1]; r.date_livraison = m[3] ? facDate(m[3]) : null; }
      if ((m = /^([A-Z0-9]{2,})\s+(.+?)\s+(-?\d+)\s+(-?[\d\s]+,\d{2,3})\s+(KG|PC|U)$/.exec(t)) && !r.lignes.some(l => l.ref === m[1] && l.nom === m[2].trim()))
        r.lignes.push({ ref: m[1], nom: m[2].trim(), colis: facNum(m[3]), qte: facNum(m[4]), unite: m[5] });
    });
    return r;
  },
  bl_blason(L) {
    const r = { lignes: [] };
    L.forEach(t => {
      let m;
      if ((m = /B\.L\. (\d+) Commande (\d+) .*Livr[ée] le (\d\d\/\d\d\/\d{4})/.exec(t))) { r.numero = m[1]; r.ref_commande = m[2]; r.date = r.date_livraison = facDate(m[3]); }
      if ((m = /^(\d{6})\s+(.+?)\s+[A-Z]\s+\d+\s+[A-Z]\s+(\d+,\d{3})\s+Kg\b.*?(\d+,\d{4})\s*\/Kg\s+(\d+,\d{2})$/.exec(t)))
        r.lignes.push({ ref: m[1], nom: m[2].trim(), qte: facNum(m[3]), unite: 'KG', pu: facNum(m[4]), montant: facNum(m[5]) });
      if ((m = /^TOTAL COLIS : \d+ [\d,]+ Kg ([\d\s]+,\d{2})$/.exec(t))) r.ht = facNum(m[1]);
    });
    return r;
  },
  confirmation_blason(L) {
    const r = { lignes: [] };
    L.forEach(t => {
      let m;
      if ((m = /^\d{13} \d{13} (\d{8}) (\d\d\/\d\d\/\d{4})$/.exec(t))) { r.numero = m[1]; r.date = facDate(m[2]); }
      if ((m = /^Commande (\d+) .*Livr[ée] le (\d\d\/\d\d\/\d{4})/.exec(t))) { r.numero = r.numero || m[1]; r.date_livraison = facDate(m[2]); }
      if ((m = /^(.+?)\s+(\d{6})\s+(\d+,\d{3})\s+Kg\s+(\d+,\d{4})\s*\/Kg\s+(\d+,\d{4})\s*\/Kg\s+[A-Z]\s+(\d+,\d{2})$/.exec(t)))
        r.lignes.push({ ref: m[2], nom: m[1].trim(), qte: facNum(m[3]), unite: 'KG', pu: facNum(m[5]), montant: facNum(m[6]) });
      if ((m = /^TOTAL HORS TAXES : ([\d\s]+,\d{2})$/.exec(t))) r.ht = facNum(m[1]);
    });
    return r;
  },
  arc_lodifrais(L) {
    const r = { lignes: [] };
    L.forEach(t => {
      let m;
      if ((m = /ACCUSE RECEPTION DE COMMANDE N[°º]\s*(\w+) (\d\d\/\d\d\/\d{4})/.exec(t))) { r.numero = m[1]; r.date = facDate(m[2]); }
      if ((m = /Date de livraison\s*:\s*(\d\d\/\d\d\/\d{4})/.exec(t))) r.date_livraison = facDate(m[1]);
      // "43384 EMMENTAL DES 10X10 30% 1K CENTURION 01 4.000 PI KG 8.601 34.40" : qté en PI, prix au KG
      if ((m = /^(\d{5,6})\s+(.+?)\s+\d{2}\s+(\d+\.\d{3})\s+([A-Z]{1,3})(?:\s+([A-Z]{1,3}))?\s+(\d+\.\d{3})\s+(\d+\.\d{2})$/.exec(t)))
        r.lignes.push({ ref: m[1], nom: m[2].trim(), qte: facNum(m[3]), unite: m[4], unite_prix: m[5] || m[4], pu: facNum(m[6]), montant: facNum(m[7]) });
      if ((m = /^TOTAL H\.T\. : ([\d\s]+\.\d{2})$/.exec(t))) r.ht = facNum(m[1]);
    });
    return r;
  },
};
function docParseurPour(f) {
  const s = facSup(f.fournisseur_id); const n = facNorm(s ? s.nom : '');
  const sup = n.includes('yes') ? 'yesfood' : n.includes('blason') ? 'blason' : n.includes('lodifrais') ? 'lodifrais' : null;
  const k = f.type + '_' + sup;
  return DOC_PARSEURS[k] ? k : null;
}

/* ─── Traitement d'un document ─── */
async function docTraiter(f) {
  const parseur = docParseurPour(f);
  const L = await facPdfLines(await facFetchPdf(f.pdf_path));
  const res = parseur ? DOC_PARSEURS[parseur](L) : { lignes: [] };
  const patch = { lignes_json: { parseur, ...res, nb_lignes_texte: L.length, analyse_le: new Date().toISOString() }, numero: res.numero || f.numero || null, date_facture: res.date || f.date_facture || null, montant_ht: res.ht ?? null, updated_at: new Date().toISOString() };
  Object.assign(f, patch);
  let action = 'sans_lignes';
  if (res.lignes.length) {
    const o = docTrouverCommande(f, res);
    if (o) action = await (f.type === 'bl' ? docAppliquerBl(f, res, o) : docAppliquerConfirmation(f, res, o));
    else action = await docCreerCommande(f, res);
  }
  f.ecarts_json = patch.ecarts_json = { action, commande: f._commande_id || null };
  await cuiPATCH('cmd_factures?id=eq.' + f.id, patch);
  return action;
}
// Commande visée : n° de confirmation fournisseur, sinon la commande la plus proche en date (non annulée)
function docTrouverCommande(f, res) {
  const orders = CUI.orders.filter(o => o.fournisseur_id === f.fournisseur_id && o.statut !== 'annulee' && o.statut !== 'brouillon');
  const nums = [res.ref_commande, res.numero].filter(Boolean);
  let o = orders.find(o => nums.includes(o.numero) || (o.confirmation_json && nums.includes(o.confirmation_json.numero)) || (o.bl_json && nums.includes(o.bl_json.numero)));
  if (o) return o;
  const ref = new Date(f.type === 'bl' ? (res.date_livraison || res.date) : (res.date || res.date_livraison)).getTime();
  if (isNaN(ref)) return null;
  const cands = orders.filter(o => f.type === 'bl' ? !o.bl_json && !o.numero_bl : !o.confirmation_json)
    .map(o => ({ o, dt: Math.abs(new Date(f.type === 'bl' ? (o.date_livraison || o.date_commande) : o.date_commande).getTime() - ref) }))
    .filter(x => x.dt <= 2.5 * 864e5).sort((a, b) => a.dt - b.dt);
  return cands.length ? cands[0].o : null;
}
function docProduitPour(f, l) { return facTrouverProduit({ fournisseur_id: f.fournisseur_id }, l); }
async function docAppliquerBl(f, res, o) {
  const patch = { numero_bl: o.numero_bl || res.numero || null, bl_json: { numero: res.numero, date: res.date_livraison || res.date, doc_id: f.id, lignes: res.lignes.map(l => ({ ...l, produit_id: (docProduitPour(f, l) || {}).id || null })) }, updated_at: new Date().toISOString() };
  await cuiPATCH('cmd_commandes?id=eq.' + o.id, patch); Object.assign(o, patch);
  f._commande_id = o.id;
  return 'bl_rattache';
}
async function docAppliquerConfirmation(f, res, o) {
  const patch = { confirmation_json: { numero: res.numero, date: res.date, ht: res.ht ?? null, doc_id: f.id, lignes: res.lignes }, updated_at: new Date().toISOString() };
  if (o.statut === 'envoyee') patch.statut = 'confirmee';
  if (res.date_livraison) patch.date_livraison = res.date_livraison;
  await cuiPATCH('cmd_commandes?id=eq.' + o.id, patch); Object.assign(o, patch);
  await docMajPrix(f, res, o);
  f._commande_id = o.id;
  return 'confirmee';
}
// Commande passée hors appli (téléphone, WhatsApp) : on la recrée depuis le document du fournisseur
async function docCreerCommande(f, res) {
  const sup = facSup(f.fournisseur_id); if (!sup) return 'fournisseur_inconnu';
  const prods = CUI.prods.filter(p => p.fournisseur_id === sup.id);
  const lignes = [];
  for (const l of res.lignes) {
    let p = docProduitPour(f, l);
    if (!p) {
      const [row] = await cuiPOST('cmd_produits', { fournisseur_id: sup.id, nom: docNomPropre(l.nom), unite: FAC_UNITES[(l.unite || '').toUpperCase()] === 'kilo' ? 'Kilo(s)' : 'Pièce(s)', prix: l.pu ?? null, reference: l.ref || null, ordre: 900 + prods.length + lignes.length });
      CUI.prods.push(row); p = row;
    }
    lignes.push({ produit_id: p.id, nom: p.nom, unite: p.unite, reference: p.reference, prix: l.pu ?? p.prix ?? null, quantite: l.qte, ordre: lignes.length, qte_recue: f.type === 'bl' ? l.qte : null });
  }
  const estBl = f.type === 'bl';
  const [cmd] = await cuiPOST('cmd_commandes', {
    fournisseur_id: sup.id, statut: estBl ? 'livree' : 'confirmee', numero: res.ref_commande || res.numero || cuiNextNumero(),
    date_commande: (res.date ? new Date(res.date + 'T10:00:00') : new Date()).toISOString(), date_livraison: res.date_livraison || res.date || null,
    note: `Commande hors appli — créée depuis ${DOC_TYPES[f.type].toLowerCase()} ${res.numero || ''} du fournisseur`, commande_par: null,
    total_estime: lignes.reduce((a, l) => a + (l.prix || 0) * l.quantite, 0) || null,
    numero_bl: estBl ? res.numero : null, date_reception: estBl ? new Date((res.date_livraison || res.date) + 'T12:00:00').toISOString() : null, recu_par: estBl ? 'BL fournisseur (mail)' : null,
    bl_json: estBl ? { numero: res.numero, date: res.date_livraison || res.date, doc_id: f.id, lignes: res.lignes } : null,
    confirmation_json: estBl ? null : { numero: res.numero, date: res.date, ht: res.ht ?? null, doc_id: f.id, lignes: res.lignes },
  });
  const rows = await cuiPOST('cmd_commande_lignes', lignes.map(l => ({ ...l, commande_id: cmd.id })));
  cmd.lignes = rows; CUI.orders.unshift(cmd); f._commande_id = cmd.id;
  if (!estBl) await docMajPrix(f, res, cmd);
  return 'commande_creee';
}
const docNomPropre = s => s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
// Prix du jour repris de l'accusé / confirmation (même unité de prix), historique tracé
async function docMajPrix(f, res, o) {
  for (const l of res.lignes) {
    const p = docProduitPour(f, l); if (!p || l.pu == null) continue;
    const up = FAC_UNITES[(l.unite_prix || l.unite || '').toUpperCase()];
    if (!up || facUniteApp(p.unite) !== up) continue;
    if (p.prix != null && Math.abs(p.prix - l.pu) < 0.005) continue;
    try {
      await cuiPATCH('cmd_produits?id=eq.' + p.id, { prix: l.pu }); p.prix = l.pu;
      await cuiPOST('cmd_prix_historique', { produit_id: p.id, prix: l.pu, source: `${DOC_TYPES[f.type]} ${res.numero || ''}`.trim(), date: res.date || cuiIso(new Date()) });
      const cl = o.lignes.find(x => x.produit_id === p.id);
      if (cl && cl.prix !== l.pu) { await cuiPATCH('cmd_commande_lignes?id=eq.' + cl.id, { prix: l.pu }); cl.prix = l.pu; }
    } catch (e) { console.error(e); }
  }
}

/* ─── Lecture automatique des documents non lus (toutes tablettes, à l'ouverture) ───
   Une tablette "réserve" le document (traite_at) avant de le lire pour que deux appareils
   ne traitent pas le même. */
let docAutoEnCours = false;
async function facAutoLire() {
  if (docAutoEnCours) return; docAutoEnCours = true;
  try {
    const todo = await cuiGET('cmd_factures?pdf_path=not.is.null&lignes_json=is.null&traite_at=is.null&select=*&order=created_at&limit=20');
    let n = 0;
    for (const f of todo) {
      const claim = await cuiPATCH(`cmd_factures?id=eq.${f.id}&traite_at=is.null`, { traite_at: new Date().toISOString() }).catch(() => []);
      if (!claim.length) continue;
      try {
        if (f.type === 'bl' || f.type === 'arc' || f.type === 'confirmation') await docTraiter(f);
        else await facAnalyser(f);
        n++;
        if (FAC.loaded) { const i = FAC.rows.findIndex(x => x.id === f.id); if (i >= 0) FAC.rows[i] = f; else FAC.rows.unshift(f); }
      } catch (e) { console.error('Lecture document', f.numero, e); await cuiPATCH('cmd_factures?id=eq.' + f.id, { traite_at: null }).catch(() => {}); }
    }
    if (n) { cuiRender(); if (FAC.loaded && !cui$('cui-fact').classList.contains('hidden')) facRender(); }
  } catch (e) { console.error(e); }
  finally { docAutoEnCours = false; }
}
