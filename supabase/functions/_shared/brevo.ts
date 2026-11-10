// Envoi des SMS clients par Brevo, expéditeur « BRAISEANDCO ».
// Un SMS est facturé par tranche de 160 caractères, et 70 seulement dès qu'il y a un emoji ou un
// caractère hors alphabet SMS (ç, ô, ê, â, î, û, À, ’) : les textes doivent rester courts et sans.
// « STOP au [STOP_CODE] » en fin de texte : Brevo passe le SMS en marketing, met son numéro court
// de désinscription et bloque lui-même les numéros qui répondent STOP.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const STOP = ' STOP au [STOP_CODE]';

// Numéros de remplissage saisis quand le client n'en donne pas (0606060606…) : jamais de SMS, payé pour rien.
export function fauxNumero(tel: string): boolean {
  const d = (tel || '').replace(/\D/g, '').replace(/^(0033|33)/, '0');
  return /^0{6,}/.test(d) || /^(\d\d)\1{4}$/.test(d) || /^0[67](\d)\1{7}$/.test(d) || /^0[67]12345678$/.test(d);
}

export async function expediteurBrevo(sb: SupabaseClient) {
  const { data: cle } = await sb.rpc('brevo_api_key');
  if (!cle) return null;
  // Accusés d'envoi et désinscriptions renvoyés à la même fonction que ceux de SMS Gate
  const { data: jeton } = await sb.rpc('sms_gate_webhook_token');
  const webUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/sms-gate-webhook?k=' + jeton;

  return async (mobile: string, texte: string, tag: string): Promise<string> => {
    if (fauxNumero(mobile)) throw new Error('faux_numero');
    const res = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
      method: 'POST',
      headers: { 'api-key': cle, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: 'BRAISEANDCO', recipient: mobile.replace(/^\+/, ''), content: texte, tag, webUrl }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 120));
    return String((await res.json()).messageId);
  };
}

// Mails clients par Brevo (même clé API que les SMS). L'adresse d'expédition doit être validée
// dans Brevo (Expéditeurs, domaines et IP dédiées), sinon Brevo refuse l'envoi.
export const EXPEDITEUR_MAIL = {
  name: 'Braise & Co',
  email: Deno.env.get('BREVO_MAIL_EXPEDITEUR') || 'contact@braiseandco-biganos.fr',
};

export type Mail = { to: string; nom?: string; sujet: string; html: string; texte: string; tag: string; desinscription?: string };

export async function expediteurMailBrevo(sb: SupabaseClient) {
  const { data: cle } = await sb.rpc('brevo_api_key');
  if (!cle) return null;
  return async (m: Mail): Promise<string> => {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': cle, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: EXPEDITEUR_MAIL,
        replyTo: EXPEDITEUR_MAIL,
        to: [m.nom ? { email: m.to, name: m.nom } : { email: m.to }],
        subject: m.sujet,
        htmlContent: m.html,
        textContent: m.texte,
        tags: [m.tag],
        // Bouton « Se désinscrire » de Gmail, Outlook…
        ...(m.desinscription ? { headers: { 'List-Unsubscribe': '<' + m.desinscription + '>' } } : {}),
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 120));
    return String((await res.json()).messageId);
  };
}
