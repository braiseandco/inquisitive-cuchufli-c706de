// SMS de confirmation d'une réservation, envoyé tout de suite par Brevo (expéditeur BRAISEANDCO),
// quel que soit l'appareil qui a confirmé.
//
// Appelée par l'appli Réservations dès qu'une résa est confirmée. Le texte et le numéro viennent
// de la résa en base : la fonction ne peut pas envoyer un SMS libre à un numéro choisi.
// Plusieurs appareils peuvent appeler pour la même résa : sms_envoye est posé avant l'envoi,
// un seul passe.
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

// Base de la carte fidélité (autre projet Supabase), lue avec sa clé publique comme les pages fidélité.
// Si cette base est un jour fermée à la clé publique, la phrase carte fidélité ne partira plus.
const FID_URL = 'https://ipnuwxirmfumxsguudvi.supabase.co/rest/v1/clients';
const FID_KEY = 'sb_publishable_iIxaYsXCZMBekFbl8596zQ_z7ENQ9n1';

// En cas de doute (base injoignable), on répond oui : la confirmation part sans la phrase
async function aCarteFidelite(local: string): Promise<boolean> {
  try {
    const res = await fetch(FID_URL + '?select=id&limit=1&tel=eq.' + local, {
      headers: { apikey: FID_KEY, Authorization: 'Bearer ' + FID_KEY },
      signal: AbortSignal.timeout(3000),
    });
    return !res.ok || (await res.json()).length > 0;
  } catch {
    return true;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'appareil_non_connecte' }, 401);

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== 'string' || !id) return json({ error: 'id_manquant' }, 400);

  const envoyer = await expediteurBrevo(sb);
  if (!envoyer) return json({ error: 'passerelle_non_configuree' }, 503);

  const { data: r } = await sb.from('reservations').update({ sms_envoye: true })
    .eq('id', id).eq('statut', 'confirmee').or('sms_envoye.is.null,sms_envoye.eq.false')
    .select('telephone,date,heure,personnes').maybeSingle();
  if (!r) return json({ ok: true, deja: true });

  const local = numeroFrancais(r.telephone || '');
  if (!/^0[67]\d{8}$/.test(local)) {
    await sb.from('reservations').update({ sms_envoye: false }).eq('id', id);
    return json({ error: 'numero_non_mobile' }, 422);
  }

  const texte = 'Réservation confirmée le ' + r.date.slice(8, 10) + '/' + r.date.slice(5, 7) +
    ' à ' + r.heure.slice(0, 5) + ' pour ' + r.personnes + ' pers. ' +
    (await aCarteFidelite(local) ? '' : 'Pensez à demander votre carte fidélité au barman. ') +
    'A bientot chez Braise & Co !';
  let smsId: string;
  try {
    smsId = await envoyer('+33' + local.slice(1), texte, 'confirmation');
  } catch (e) {
    await sb.from('reservations').update({ sms_envoye: false }).eq('id', id);
    return json({ error: String(e).slice(0, 200) }, 502);
  }
  await sb.from('sms_envois').insert({ gate_id: smsId, telephone: local, type: 'confirmation', texte });
  return json({ ok: true, id: smsId });
});
