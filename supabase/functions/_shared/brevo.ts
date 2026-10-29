// Envoi des SMS clients par Brevo, expéditeur « BRAISEANDCO ».
// Un SMS est facturé par tranche de 160 caractères, et 70 seulement dès qu'il y a un emoji ou un
// caractère hors alphabet SMS (ç, ô, ê, â, î, û, À, ’) : les textes doivent rester courts et sans.
// « STOP au [STOP_CODE] » en fin de texte : Brevo passe le SMS en marketing, met son numéro court
// de désinscription et bloque lui-même les numéros qui répondent STOP.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const STOP = ' STOP au [STOP_CODE]';

export async function expediteurBrevo(sb: SupabaseClient) {
  const { data: cle } = await sb.rpc('brevo_api_key');
  if (!cle) return null;
  // Accusés d'envoi et désinscriptions renvoyés à la même fonction que ceux de SMS Gate
  const { data: jeton } = await sb.rpc('sms_gate_webhook_token');
  const webUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/sms-gate-webhook?k=' + jeton;

  return async (mobile: string, texte: string, tag: string): Promise<string> => {
    const res = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
      method: 'POST',
      headers: { 'api-key': cle, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: 'BRAISEANDCO', recipient: mobile.replace(/^\+/, ''), content: texte, tag, webUrl }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 120));
    return String((await res.json()).messageId);
  };
}
