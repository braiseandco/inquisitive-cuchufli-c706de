// Accusés des SMS envoyés et réponses STOP, venant de deux sources :
// - Brevo (SMS clients) : un appel par événement du SMS (msg_status sent, delivered, soft_bounce…) ;
// - l'appli SMS Gate du téléphone (SMS internes) : sms:sent, sms:delivered, sms:failed, sms:received.
// Le jeton ?k= de l'adresse, rangé dans le coffre, prouve que l'appel vient bien de l'une des deux.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const ETATS: Record<string, string> = {
  'sms:sent': 'Sent', 'sms:delivered': 'Delivered', 'sms:failed': 'Failed', 'sms:cancelled': 'Cancelled',
};
// Failed déclenche un renvoi automatique (trigger sms_envois_renvoi) : seulement pour un échec passager.
// Numéro invalide, refusé ou bloqué chez Brevo → Rejected, jamais renvoyé.
const ETATS_BREVO: Record<string, string> = {
  sent: 'Sent', accepted: 'Sent', delivered: 'Delivered', soft_bounce: 'Failed',
  hard_bounce: 'Rejected', rej: 'Rejected', rejected: 'Rejected', bl: 'Rejected', blacklisted: 'Rejected', skip: 'Rejected',
};
// Un webhook en retard ne doit pas faire reculer l'état (Delivered avant Sent)
const RANG: Record<string, number> = { Pending: 0, Processed: 1, Sent: 2, Delivered: 3, Failed: 3, Cancelled: 3, Rejected: 3 };

function numeroFrancais(tel: string): string {
  let d = (tel || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+33')) d = '0' + d.slice(3);
  else if (d.startsWith('0033')) d = '0' + d.slice(4);
  else if (/^33[67]\d{8}$/.test(d)) d = '0' + d.slice(2);
  return d;
}

async function majEtat(id: string, etat: string, raison: string | null) {
  const { data: ligne } = await sb.from('sms_envois').select('etat').eq('gate_id', id).maybeSingle();
  if (ligne && (RANG[etat] ?? 0) >= (RANG[ligne.etat] ?? 0)) {
    await sb.from('sms_envois').update({ etat, raison, maj_at: new Date().toISOString() }).eq('gate_id', id);
  }
}

async function noterStop(tel: string, message: string) {
  await sb.from('sms_stop').upsert({ telephone: numeroFrancais(tel), message: message.slice(0, 160), recu_at: new Date().toISOString() });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { data: jeton } = await sb.rpc('sms_gate_webhook_token');
  if (!jeton || new URL(req.url).searchParams.get('k') !== jeton) return new Response('forbidden', { status: 403 });

  let corps: Record<string, unknown> = {};
  try { corps = await req.json(); } catch { return new Response('ok'); }

  if (corps.msg_status) {
    const statut = String(corps.msg_status);
    const etat = ETATS_BREVO[statut];
    if (etat && corps.messageId) {
      await majEtat(String(corps.messageId), etat, (corps.description || corps.error_code || null) as string | null);
    }
    if (/^unsubscri/.test(statut) || (statut === 'replied' && /^\W*stop\b/i.test(String(corps.reply || '').trim()))) {
      await noterStop(String(corps.to || ''), String(corps.reply || 'STOP (Brevo)'));
    }
    return new Response('ok');
  }

  const p = (corps.payload || {}) as Record<string, unknown>;
  const etat = ETATS[String(corps.event || '')];
  if (etat && p.messageId) await majEtat(String(p.messageId), etat, (p.reason as string) || null);

  if (corps.event === 'sms:received' && /^\W*stop\b/i.test(String(p.message || '').trim())) {
    await noterStop(String(p.sender || ''), String(p.message));
  }

  return new Response('ok');
});
