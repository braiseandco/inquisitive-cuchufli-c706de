// Envoi groupé des SMS cadeaux de la roulette par Brevo (expéditeur BRAISEANDCO).
//
// Appelée par le bouton « Tout envoyer » de l'onglet Roulette. Envoi immédiat, sans attendre 10h30
// comme les relances : le client vient de jouer et attend son cadeau. Un gain n'est marqué envoyé
// qu'une fois accepté par Brevo ; un numéro fixe reste dans la liste, à faire à la main.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { expediteurBrevo } from '../_shared/brevo.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

// Transactionnel (pas de STOP) : le SMS répond au jeu du client
function message(cadeau: string): string {
  const texte = ({ 'Café offert': 'un café', 'Digestif offert': 'un digestif', 'Apéro offert': 'un apéro', 'Dessert offert': 'un dessert' } as Record<string, string>)[cadeau]
    || (cadeau || '').toLowerCase();
  return 'Bravo ! Vous avez gagné ' + texte + ' lors de votre prochaine visite chez Braise & Co. Montrez ce SMS, valable 30 jours.';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'appareil_non_connecte' }, 401);

  const envoyer = await expediteurBrevo(sb);
  if (!envoyer) return json({ error: 'passerelle_non_configuree' }, 503);

  const { data: gains, error } = await sb.from('roulette_gains').select('id,telephone,cadeau')
    .eq('sms_envoye', false).order('created_at').limit(100);
  if (error) return json({ error: error.message }, 500);

  let envoyes = 0, nonMobiles = 0;
  const erreurs: string[] = [];
  for (const g of gains || []) {
    const mobile = numeroMobile(g.telephone || '');
    if (!mobile) { nonMobiles++; continue; }
    const texte = message(g.cadeau);
    try {
      const id = await envoyer(mobile, texte, 'roulette');
      await sb.from('roulette_gains').update({ sms_envoye: true }).eq('id', g.id);
      await sb.from('sms_envois').insert({ gate_id: id, telephone: numeroFrancais(g.telephone), type: 'roulette', texte });
      envoyes++;
    } catch (e) {
      erreurs.push(g.telephone + ' : ' + String(e).slice(0, 120));
    }
  }
  return json({ envoyes, nonMobiles, erreurs });
});
