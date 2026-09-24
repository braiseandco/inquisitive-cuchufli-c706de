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
  if (res.lignes.length && f.type !== 'bl') action = await docRepartirAccuse(f, res);
  else if (res.lignes.length) { const o = docTrouverCommande(f, res); action = await (o ? docAppliquerBl(f, res, o) : docCreerCommande(f, res)); }
  f.ecarts_json = patch.ecarts_json = { action, commande: f._commande_id || null };
  await cuiPATCH('cmd_factures?id=eq.' + f.id, patch);
  return action;
}
// Commande visée : n° de confirmation fournisseur, sinon la commande la plus proche en date (non annulée)
function docTrouverCommande(f, res, exclues = []) {
  const orders = CUI.orders.filter(o => o.fournisseur_id === f.fournisseur_id && o.statut !== 'annulee' && o.statut !== 'brouillon' && !exclues.includes(o));
  const nums = [res.ref_commande, res.numero].filter(Boolean);
  let o = orders.find(o => nums.includes(o.numero) || docAccuses(o).some(a => nums.includes(a.numero)) || (o.bl_json && nums.includes(o.bl_json.numero)));
  if (o) return o;
  const ref = new Date(f.type === 'bl' ? (res.date_livraison || res.date) : (res.date || res.date_livraison)).getTime();
  if (isNaN(ref)) return null;
  // Plusieurs commandes proches (Choco + téléphone le même jour) : on prend celle dont les références
  // sont dans le document, une commande sans aucune référence commune n'est jamais rattachée
  const refs = res.lignes.map(l => docRef(l.ref)).filter(Boolean);
  const hits = o => (o.lignes || []).filter(l => refs.includes(docRef(l.reference))).length;
  // Une commande déjà confirmée reste candidate si l'accusé recoupe ses références : Lodifrais
  // envoie un accusé par date de livraison (IV308260 puis IV308244 pour BC260920-02, 22/09/2026)
  const cands = orders.filter(o => f.type !== 'bl' || (!o.bl_json && !o.numero_bl))
    .map(o => ({ o, hits: hits(o), dt: Math.abs(new Date(f.type === 'bl' ? (o.date_livraison || o.date_commande) : o.date_commande).getTime() - ref) }))
    .filter(x => x.dt <= 2.5 * 864e5 && (x.hits > 0 || (!refs.length && (f.type === 'bl' || !x.o.confirmation_json)))).sort((a, b) => b.hits - a.hits || a.dt - b.dt);
  return cands.length ? cands[0].o : null;
}
const docRef = r => r ? String(r).replace(/\D/g, '').replace(/^0+/, '') : '';
const docAccuses = o => !o.confirmation_json ? [] : o.confirmation_json.accuses || [o.confirmation_json];
const docSomme = ls => ls.some(l => l.montant == null) ? null : Math.round(ls.reduce((a, l) => a + l.montant, 0) * 100) / 100;
// Ligne x de la commande o couverte par la ligne l du document : même référence, sinon même produit
const docCouvre = (f, l, x, o) => (!!docRef(l.ref) && docRef(l.ref) === docRef(x.reference)) || (!!x.produit_id && x.produit_id === (docProduitPour(f, l, o) || {}).id);
// Un accusé peut mêler une commande appli et un complément téléphoné (IV308244 : 27 lignes de
// BC260920-02 + 8 commandées au commercial) : chaque commande ouverte prend ses lignes, seul le
// reste devient une commande « hors appli », sans doublonner ce qui est déjà commandé.
async function docRepartirAccuse(f, res) {
  let reste = res.lignes, o; const vues = [], confirmees = [];
  while (reste.length && (o = docTrouverCommande(f, { ...res, lignes: reste }, vues))) {
    vues.push(o);
    const siennes = reste.filter(l => (o.lignes || []).some(x => docCouvre(f, l, x, o)));
    const prises = siennes.length ? siennes : reste;
    await docAppliquerConfirmation(f, { ...res, lignes: prises, ht: prises.length === res.lignes.length ? res.ht : docSomme(prises) }, o);
    confirmees.push(o.id); reste = reste.filter(l => !prises.includes(l));
  }
  const action = reste.length ? await docCreerCommande(f, { ...res, lignes: reste, ht: confirmees.length ? docSomme(reste) : res.ht }) : 'confirmee';
  if (!confirmees.length) return action;
  f._commande_id = confirmees[0];
  return 'confirmee';
}
// Prix dans l'unité de l'appli : le fournisseur peut facturer au kilo une quantité en pièces
// (Lodifrais : "2.000 PI KG 1.900 19.00" = 2 seaux à 9,50 €) → on repart du montant de la ligne
function docPrixUnite(p, l) {
  const uq = FAC_UNITES[(l.unite || '').toUpperCase()], up = FAC_UNITES[(l.unite_prix || l.unite || '').toUpperCase()];
  const ua = facUniteApp(p.unite);
  if (up && ua === up && l.pu != null) return l.pu;
  if (uq && ua === uq && l.montant != null && l.qte) return Math.round(l.montant / l.qte * 1000) / 1000;
  // Commandé au colis, facturé au poids (DS : poche de 2,5 kg) : prix du kilo ramené à la poche
  const poids = facConvPoids(p, l.unite_prix || l.unite);
  if (poids && l.pu != null) return Math.round(l.pu * poids * 1000) / 1000;
  return null;
}
// Quantité dans l'unité de l'appli. Le fournisseur compte dans la sienne — 90 pièces, 4 sachets,
// 6 colis — alors que le prix, lui, a été ramené à l'unité de l'appli : le carton, le kilo. Les
// multiplier l'un par l'autre donne n'importe quoi. Un accusé Lodifrais du 23/09/2026 annonçait
// un carton de 90 œufs à 19,80 € ; la commande créée portait 90 cartons, soit 1 782 €.
// Le montant de la ligne est le seul point fixe : il fait foi.
function docQteUnite(p, l, prix) {
  const poids = facConvPoids(p, l.unite);
  if (poids) return Math.round(l.qte / poids * 1000) / 1000;
  const uq = FAC_UNITES[(l.unite || '').toUpperCase()];
  if (uq && facUniteApp(p.unite) === uq) return l.qte;   // mêmes unités, rien à convertir
  if (prix > 0 && l.montant != null) {
    const q = Math.round(l.montant / prix * 1000) / 1000;
    // Un écart infime vient de l'arrondi du prix de la fiche, pas d'un changement d'unité :
    // on garde alors le compte rond du fournisseur plutôt qu'un 11,988.
    return (l.qte && Math.abs(q - l.qte) / l.qte < 0.02) ? l.qte : q;
  }
  return l.qte;
}
// Sur une commande, la référence de sa ligne désigne le produit, même retiré du catalogue depuis :
// sinon le nom rabat la ligne sur un voisin (boudin 117848 pris pour le 65921, 23/09/2026)
function docProduitPour(f, l, o) {
  const x = o && docRef(l.ref) && (o.lignes || []).find(x => docRef(x.reference) === docRef(l.ref));
  if (x) return CUI.prods.find(p => p.id === x.produit_id) || null;
  return facTrouverProduit({ fournisseur_id: f.fournisseur_id }, l);
}
async function docAppliquerBl(f, res, o) {
  const patch = { numero_bl: o.numero_bl || res.numero || null, bl_json: { numero: res.numero, date: res.date_livraison || res.date, doc_id: f.id, lignes: res.lignes.map(l => ({ ...l, produit_id: (docProduitPour(f, l, o) || {}).id || null })) }, updated_at: new Date().toISOString() };
  await cuiPATCH('cmd_commandes?id=eq.' + o.id, patch); Object.assign(o, patch);
  f._commande_id = o.id;
  return 'bl_rattache';
}
// confirmation_json cumule tous les accusés de la commande (numero / ht / lignes lus par cuisine.js)
// et garde chacun dans accuses. Le HT n'est « confirmé » que si toutes les lignes le sont.
async function docAppliquerConfirmation(f, res, o) {
  const acc = { numero: res.numero, date: res.date, date_livraison: res.date_livraison || null, ht: res.ht ?? null, doc_id: f.id, lignes: res.lignes };
  const accuses = [...docAccuses(o).filter(a => a.numero !== acc.numero), acc];
  // Un produit livré en deux fois (saucisse : 23/09 puis reliquat du 25/09) ne fait qu'une ligne
  const lignes = [];
  accuses.flatMap(a => a.lignes || []).forEach(l => {
    const d = docRef(l.ref) && lignes.find(x => docRef(x.ref) === docRef(l.ref) && x.unite === l.unite);
    if (!d) return lignes.push({ ...l });
    d.qte = Math.round(((d.qte || 0) + (l.qte || 0)) * 1000) / 1000;
    d.montant = d.montant != null && l.montant != null ? Math.round((d.montant + l.montant) * 100) / 100 : null;
  });
  const couvre = ls => (o.lignes || []).every(x => ls.some(l => docCouvre(f, l, x, o)));
  const ht = couvre(lignes) && accuses.every(a => a.ht != null) ? Math.round(accuses.reduce((s, a) => s + a.ht, 0) * 100) / 100 : null;
  const patch = { confirmation_json: { numero: accuses.map(a => a.numero).join(' + '), date: res.date, ht, doc_id: f.id, lignes, accuses }, updated_at: new Date().toISOString() };
  if (o.statut === 'envoyee') patch.statut = 'confirmee';
  // Un accusé partiel (reliquat livré plus tard) ne déplace pas la livraison de toute la commande
  if (res.date_livraison && couvre(res.lignes)) patch.date_livraison = res.date_livraison;
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
      const [row] = await cuiPOST('cmd_produits', { fournisseur_id: sup.id, nom: docNomPropre(l.nom), unite: FAC_UNITES[(l.unite || '').toUpperCase()] === 'kilo' ? 'Kilo(s)' : 'Pièce(s)', prix: (l.montant != null && l.qte) ? Math.round(l.montant / l.qte * 1000) / 1000 : l.pu ?? null, reference: l.ref || null, ordre: 900 + prods.length + lignes.length });
      CUI.prods.push(row); p = row;
    }
    const prix = docPrixUnite(p, l) ?? p.prix ?? null;
    const qte = docQteUnite(p, l, prix);
    lignes.push({ produit_id: p.id, nom: p.nom, unite: p.unite, reference: p.reference, prix, quantite: qte, ordre: lignes.length, qte_recue: f.type === 'bl' ? qte : null });
  }
  const estBl = f.type === 'bl';
  const [cmd] = await cuiPOST('cmd_commandes', {
    fournisseur_id: sup.id, statut: estBl ? 'livree' : 'confirmee', numero: res.ref_commande || res.numero || await cuiNumeroLibre(),
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
    const p = docProduitPour(f, l, o); if (!p) continue;
    const prix = docPrixUnite(p, l);
    if (prix == null || (p.prix != null && Math.abs(p.prix - prix) < 0.005)) continue;
    try {
      await cuiPATCH('cmd_produits?id=eq.' + p.id, { prix }); p.prix = prix;
      await cuiPOST('cmd_prix_historique', { produit_id: p.id, prix, source: `${DOC_TYPES[f.type]} ${res.numero || ''}`.trim(), date: res.date || cuiIso(new Date()) });
      const cl = (o.lignes || []).find(x => x.produit_id === p.id);
      if (cl && cl.prix !== prix) { await cuiPATCH('cmd_commande_lignes?id=eq.' + cl.id, { prix }); cl.prix = prix; }
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
