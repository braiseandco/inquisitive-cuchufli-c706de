// Envoi groupé des relances J+30 depuis le téléphone Android du resto (appli SMS Gate, mode Cloud).
//
// Appelée par le bouton « Tout envoyer » de l'onglet Relances. La liste est recalculée ici, avec
// les mêmes règles que l'appli : on ne peut pas lui faire envoyer un SMS à un numéro choisi.
// La passerelle met les messages en file ; c'est le téléphone qui les étale (Réglages → Messages
// → Délai entre messages), pour ne pas envoyer 50 SMS d'un coup.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SMSGATE_URL = 'https://api.sms-gate.app/3rdparty/v1/message';
const MAX_PAR_ENVOI = 100;

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

function numeroMobile(tel: string): string | null {
  const d = numeroFrancais(tel);
  return /^0[67]\d{8}$/.test(d) ? '+33' + d.slice(1) : null;
}

const jourParis = (decalage: number) => {
  const d = new Date(Date.now() + decalage * 86400_000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
};

function message(): string {
  const fin = new Date(Date.now() + 7 * 86400_000)
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  return 'Bonjour, ça fait un moment qu\'on ne vous a pas vu au Braise & Co, vous nous manquez !! Si vous venez avant le ' + fin +
    ', présentez nous ce sms et on vous offre votre apéro ! (un seul apéro par table) 🔥 Vous pouvez réserver via notre site internet : www.braiseandco-biganos.fr ou par tél au : 09 86 12 97 14. A très bientôt ! STOP SMS : répondez STOP';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Appareils connectés seulement (pas la clé publique)
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'appareil_non_connecte' }, 401);

  const { data: ids } = await sb.rpc('sms_gateway_identifiants');
  const cred = ids?.[0];
  if (!cred?.utilisateur || !cred?.mot_de_passe) return json({ error: 'passerelle_non_configuree' }, 503);

  // Mêmes règles que loadRelances : 6 mois de résas, dernière visite il y a plus de 29 jours
  const { data: resas, error } = await sb.from('reservations')
    .select('telephone,nom,date,relance_mois_envoye')
    .gte('date', jourParis(-183)).not('telephone', 'is', null)
    .not('id', 'like', 'roulette_%').not('id', 'like', 'fid_%')
    .order('date', { ascending: false }).limit(5000);
  if (error) return json({ error: error.message }, 500);

  const map: Record<string, { derniere: string; relance: boolean; bruts: Set<string> }> = {};
  for (const r of resas || []) {
    const tel = (r.telephone || '').replace(/\s/g, '');
    if (!tel || tel.length < 9 || /^0{6,}/.test(tel)) continue;
    if (!map[tel]) map[tel] = { derniere: r.date, relance: !!r.relance_mois_envoye, bruts: new Set() };
    map[tel].bruts.add(r.telephone);
  }
  const { data: stops } = await sb.from('sms_stop').select('telephone');
  const stop = new Set((stops || []).map((s) => s.telephone));
  const limite = jourParis(-29);
  const clients = Object.entries(map)
    .filter(([tel, c]) => c.derniere < limite && !c.relance && !stop.has(numeroFrancais(tel)));

  const texte = message();
  const auth = 'Basic ' + btoa(cred.utilisateur + ':' + cred.mot_de_passe);
  let envoyes = 0, nonMobiles = 0;
  const erreurs: string[] = [];

  for (const [tel, c] of clients.slice(0, MAX_PAR_ENVOI)) {
    const mobile = numeroMobile(tel);
    if (!mobile) { nonMobiles++; continue; }
    try {
      const res = await fetch(SMSGATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ textMessage: { text: texte }, phoneNumbers: [mobile] }),
      });
      if (!res.ok) { erreurs.push(tel + ' : HTTP ' + res.status + ' ' + (await res.text()).slice(0, 120)); continue; }
      const envoi = await res.json().catch(() => ({}));
      if (envoi.id) await sb.from('sms_envois').insert({ gate_id: envoi.id, telephone: numeroFrancais(tel) });
    } catch (e) {
      erreurs.push(tel + ' : ' + String(e).slice(0, 120));
      continue;
    }
    // Comme le bouton manuel : relance notée, numéro effacé
    await sb.from('reservations').update({ relance_mois_envoye: true, telephone: null }).in('telephone', [...c.bruts]);
    envoyes++;
  }

  return json({ envoyes, nonMobiles, erreurs, restants: Math.max(0, clients.length - MAX_PAR_ENVOI) });
});
