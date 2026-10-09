// Envoi groupé des relances J+30 depuis le téléphone Android du resto (appli SMS Gate, mode Cloud).
//
// Appelée par le bouton « Tout envoyer » de l'onglet Relances. La liste est recalculée ici, avec
// les mêmes règles que l'appli : on ne peut pas lui faire envoyer un SMS à un numéro choisi.
// La passerelle met les messages en file ; c'est le téléphone qui les étale (Réglages → Messages
// → Délai entre messages), pour ne pas envoyer 50 SMS d'un coup.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

// Pour ne réveiller personne : avant 10h30 ou après 20h (heure de Paris), les SMS attendent
// 10h30 dans sms_programmes. Pas de scheduleAt : le téléphone ne renvoie pas l'état de ces SMS-là.
function departPrevu(): string | null {
  const maintenant = new Date();
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(maintenant).map((x) => [x.type, x.value]));
  const minutes = +p.hour * 60 + +p.minute;
  if (minutes >= 630 && minutes < 1200) return null;
  const decalage = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(maintenant.getTime() / 60000) * 60000;
  const jour = +p.day + (minutes >= 1200 ? 1 : 0);
  return new Date(Date.UTC(+p.year, +p.month - 1, jour, 10, 30) - decalage).toISOString();
}

function message(): string {
  const fin = new Date(Date.now() + 7 * 86400_000)
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  return 'Bonjour, ça fait un moment qu\'on ne vous a pas vu au Braise & Co, vous nous manquez !! Si vous venez avant le ' + fin +
    ', présentez nous ce sms et on vous offre votre apéro ! (un seul apéro par table) 🔥 Vous pouvez réserver via notre site internet : www.braiseandco-biganos.fr ou par tél au : 09 86 12 97 14. A très bientôt ! STOP SMS : répondez STOP';
}

async function envoyerSms(auth: string, mobile: string, texte: string): Promise<string | undefined> {
  const res = await fetch(SMSGATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ textMessage: { text: texte }, phoneNumbers: [mobile] }),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 120));
  return (await res.json().catch(() => ({}))).id;
}

// Appel du cron sms-programmes : envoie les SMS dont l'heure est passée
async function viderFile(sb: SupabaseClient, auth: string) {
  const { data: dus } = await sb.from('sms_programmes').select('id,telephone,texte,tentatives')
    .lte('envoyer_at', new Date().toISOString()).lt('tentatives', 3).order('id').limit(MAX_PAR_ENVOI);
  let envoyes = 0;
  const erreurs: string[] = [];
  for (const s of dus || []) {
    try {
      const id = await envoyerSms(auth, s.telephone, s.texte);
      if (id) await sb.from('sms_envois').insert({ gate_id: id, telephone: numeroFrancais(s.telephone) });
      await sb.from('sms_programmes').delete().eq('id', s.id);
      envoyes++;
    } catch (e) {
      await sb.from('sms_programmes').update({ tentatives: s.tentatives + 1 }).eq('id', s.id);
      erreurs.push(s.telephone + ' : ' + String(e).slice(0, 120));
    }
  }
  return { envoyes, erreurs };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const cronKey = req.headers.get('x-cron-key');
  if (cronKey) {
    const { data: jeton } = await sb.rpc('sms_gate_webhook_token');
    if (!jeton || cronKey !== jeton) return json({ error: 'forbidden' }, 403);
  } else {
    // Appareils connectés seulement (pas la clé publique)
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await sb.auth.getUser(jwt);
    if (!u?.user) return json({ error: 'appareil_non_connecte' }, 401);
  }

  const { data: ids } = await sb.rpc('sms_gateway_identifiants');
  const cred = ids?.[0];
  if (!cred?.utilisateur || !cred?.mot_de_passe) return json({ error: 'passerelle_non_configuree' }, 503);
  const auth = 'Basic ' + btoa(cred.utilisateur + ':' + cred.mot_de_passe);
  if (cronKey) return json(await viderFile(sb, auth));

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
    .filter(([tel, c]) => c.derniere <= limite && !c.relance && !stop.has(numeroFrancais(tel)));

  const texte = message();
  const programme = departPrevu();
  let envoyes = 0, nonMobiles = 0;
  const erreurs: string[] = [];

  for (const [tel, c] of clients.slice(0, MAX_PAR_ENVOI)) {
    const mobile = numeroMobile(tel);
    if (!mobile) { nonMobiles++; continue; }
    try {
      if (programme) {
        const { error: e } = await sb.from('sms_programmes').insert({ telephone: mobile, texte, envoyer_at: programme });
        if (e) throw new Error(e.message);
      } else {
        const id = await envoyerSms(auth, mobile, texte);
        if (id) await sb.from('sms_envois').insert({ gate_id: id, telephone: numeroFrancais(tel) });
      }
    } catch (e) {
      erreurs.push(tel + ' : ' + String(e).slice(0, 120));
      continue;
    }
    // Comme le bouton manuel : relance notée, numéro effacé
    await sb.from('reservations').update({ relance_mois_envoye: true, telephone: null }).in('telephone', [...c.bruts]);
    envoyes++;
  }

  return json({ envoyes, nonMobiles, erreurs, programme, restants: Math.max(0, clients.length - MAX_PAR_ENVOI) });
});
