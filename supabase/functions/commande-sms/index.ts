// Commande fournisseur par SMS, envoyée depuis le téléphone du resto (appli SMS Gate, mode Cloud).
// Avant, l'appli ouvrait l'appli SMS de l'appareil et la commande passait « envoyée » sans savoir
// si le SMS partait : le 25/10/2026, Mericq et Les Platins n'ont rien reçu.
// Ici la commande ne passe en « envoyée » que si SMS Gate a accepté le SMS du fournisseur.
// Le texte et les numéros viennent de la base : la fonction ne peut écrire qu'aux fournisseurs enregistrés.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SMSGATE_URL = 'https://api.sms-gate.app/3rdparty/v1/message';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function numeroFrancais(tel: string): string {
  let d = tel.replace(/[^\d+]/g, '');
  if (d.startsWith('+33')) d = '0' + d.slice(3);
  else if (d.startsWith('0033')) d = '0' + d.slice(4);
  else if (/^33[67]\d{8}$/.test(d)) d = '0' + d.slice(2);
  return d;
}

const qty = (n: number) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const unite = (u: string, n: number) => /^kilo/i.test(u || '') ? 'kg' : n > 1 && /^[a-zà-ÿ]+$/i.test(u || '') && !/s$/.test(u) ? u + 's' : (u || '');

// Même texte que cuiOrderSmsText dans boissons/cuisine.js (« carton » du bar mis au pluriel).
// Pas de date de livraison : chaque fournisseur livre selon son propre planning.
function texte(o: any) {
  const lignes = [...o.lignes].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
    .map((l: any) => `- ${qty(l.quantite)} ${unite(l.unite, Number(l.quantite))} ${l.nom}`).join('\n');
  return `Bonjour, commande Braise & Co Biganos :\n${lignes}${o.note ? '\n' + o.note : ''}\nMerci, ${o.commande_par || ''}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'Appareil non connecté' }, 401);

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== 'string' || !id) return json({ error: 'id manquant' }, 400);

  const echec = async (error: string, status: number) => {
    await sb.from('cmd_commandes').update({ mail_erreur: error.slice(0, 500) }).eq('id', id);
    return json({ error }, status);
  };

  const { data: o } = await sb.from('cmd_commandes')
    .select('*, lignes:cmd_commande_lignes(*), f:cmd_fournisseurs(*)').eq('id', id).maybeSingle();
  if (!o) return json({ error: 'Commande introuvable' }, 404);
  const s = o.f;
  const local = numeroFrancais(s.telephone || '');
  if (!/^0[67]\d{8}$/.test(local)) return echec(`Pas de numéro de mobile pour ${s.nom}`, 400);
  if (!o.lignes.length || !o.numero) return echec('Commande incomplète (lignes ou numéro)', 400);

  const { data: ids } = await sb.rpc('sms_gateway_identifiants');
  const cred = ids?.[0];
  if (!cred?.utilisateur || !cred?.mot_de_passe) return echec("SMS Gate n'est pas branché", 503);

  const msg = texte(o);
  const envoyer = async (tel: string) => {
    const res = await fetch(SMSGATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa(cred.utilisateur + ':' + cred.mot_de_passe) },
      // priority >= 100 : passe devant les relances en file et ignore le délai entre messages du téléphone
      body: JSON.stringify({ textMessage: { text: msg }, phoneNumbers: ['+33' + tel.slice(1)], priority: 100 }),
    });
    if (!res.ok) throw new Error('SMS Gate HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
    const gateId = (await res.json().catch(() => ({}))).id;
    if (gateId) await sb.from('sms_envois').insert({ gate_id: gateId, telephone: tel, type: 'commande', texte: msg });
    return gateId;
  };

  let gateId: string;
  try { gateId = await envoyer(local); }
  catch (e) { return echec(e instanceof Error ? e.message : String(e), 502); }

  const copie = numeroFrancais(s.sms_copie_tel || '');
  if (/^0[67]\d{8}$/.test(copie)) await envoyer(copie).catch((e) => console.error('copie', e));

  // mail_envoye_le / mail_id servent aussi au SMS : l'heure d'envoi et l'id SMS Gate
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { mail_envoye_le: now, mail_id: gateId || null, mail_erreur: null, updated_at: now };
  if (o.statut === 'brouillon') Object.assign(patch, { statut: 'envoyee', date_commande: now });
  const { data: row } = await sb.from('cmd_commandes').update(patch).eq('id', id).select().single();
  return json({ ok: true, id: gateId, commande: row });
});
