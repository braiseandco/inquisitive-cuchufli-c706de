// Envoi groupé des SMS cadeaux de la roulette depuis le téléphone du resto (appli SMS Gate, mode Cloud).
//
// Appelée par le bouton « Tout envoyer » de l'onglet Roulette. Envoi immédiat, sans attendre 10h30
// comme les relances : le client vient de jouer et attend son cadeau. Un gain n'est marqué envoyé
// qu'une fois accepté par la passerelle ; un numéro fixe reste dans la liste, à faire à la main.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function numeroMobile(tel: string): string | null {
  const d = numeroFrancais(tel);
  return /^0[67]\d{8}$/.test(d) ? '+33' + d.slice(1) : null;
}

// Même texte que la carte de l'onglet Roulette
function message(cadeau: string): string {
  const texte = ({ 'Café offert': 'un café', 'Digestif offert': 'un digestif', 'Apéro offert': 'un apéro', 'Dessert offert': 'un dessert' } as Record<string, string>)[cadeau]
    || (cadeau || '').toLowerCase();
  return 'Merci d\'avoir joué à notre jeu chez Braise & Co ! 🎰 Nous sommes heureux de vous offrir ' + texte +
    ' lors de votre prochaine visite. À très bientôt ! 🔥 (SMS à présenter lors de votre prochaine visite au Braise & Co) Offre valable 30 jours.';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'appareil_non_connecte' }, 401);

  const { data: ids } = await sb.rpc('sms_gateway_identifiants');
  const cred = ids?.[0];
  if (!cred?.utilisateur || !cred?.mot_de_passe) return json({ error: 'passerelle_non_configuree' }, 503);
  const auth = 'Basic ' + btoa(cred.utilisateur + ':' + cred.mot_de_passe);

  const { data: gains, error } = await sb.from('roulette_gains').select('id,telephone,cadeau')
    .eq('sms_envoye', false).order('created_at').limit(100);
  if (error) return json({ error: error.message }, 500);

  let envoyes = 0, nonMobiles = 0;
  const erreurs: string[] = [];
  for (const g of gains || []) {
    const mobile = numeroMobile(g.telephone || '');
    if (!mobile) { nonMobiles++; continue; }
    try {
      const res = await fetch(SMSGATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ textMessage: { text: message(g.cadeau) }, phoneNumbers: [mobile] }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 120));
      const id = (await res.json().catch(() => ({}))).id;
      await sb.from('roulette_gains').update({ sms_envoye: true }).eq('id', g.id);
      if (id) await sb.from('sms_envois').insert({ gate_id: id, telephone: numeroFrancais(g.telephone), type: 'roulette' });
      envoyes++;
    } catch (e) {
      erreurs.push(g.telephone + ' : ' + String(e).slice(0, 120));
    }
  }
  return json({ envoyes, nonMobiles, erreurs });
});
