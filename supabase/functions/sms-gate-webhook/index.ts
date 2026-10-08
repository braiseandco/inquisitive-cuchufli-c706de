// Appelée par l'appli SMS Gate du téléphone du resto : état des SMS envoyés (sms:sent,
// sms:delivered, sms:failed) et SMS reçus (sms:received), pour noter les réponses STOP.
// Le jeton ?k= de l'adresse, rangé dans le coffre, prouve que l'appel vient bien de SMS Gate.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const ETATS: Record<string, string> = {
  'sms:sent': 'Sent', 'sms:delivered': 'Delivered', 'sms:failed': 'Failed', 'sms:cancelled': 'Cancelled',
};
// Un webhook en retard ne doit pas faire reculer l'état (Delivered avant Sent)
const RANG: Record<string, number> = { Pending: 0, Processed: 1, Sent: 2, Delivered: 3, Failed: 3, Cancelled: 3 };

function numeroFrancais(tel: string): string {
  let d = (tel || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+33')) d = '0' + d.slice(3);
  else if (d.startsWith('0033')) d = '0' + d.slice(4);
  return d;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { data: jeton } = await sb.rpc('sms_gate_webhook_token');
  if (!jeton || new URL(req.url).searchParams.get('k') !== jeton) return new Response('forbidden', { status: 403 });

  let corps: { event?: string; payload?: Record<string, unknown> } = {};
  try { corps = await req.json(); } catch { return new Response('ok'); }
  const p = corps.payload || {};

  const etat = ETATS[corps.event || ''];
  if (etat && p.messageId) {
    const { data: ligne } = await sb.from('sms_envois').select('etat').eq('gate_id', p.messageId).maybeSingle();
    if (ligne && (RANG[etat] ?? 0) >= (RANG[ligne.etat] ?? 0)) {
      await sb.from('sms_envois')
        .update({ etat, raison: (p.reason as string) || null, maj_at: new Date().toISOString() })
        .eq('gate_id', p.messageId);
    }
  }

  if (corps.event === 'sms:received' && /^\W*stop\b/i.test(String(p.message || '').trim())) {
    await sb.from('sms_stop').upsert({
      telephone: numeroFrancais(String(p.sender || '')),
      message: String(p.message).slice(0, 160),
      recu_at: new Date().toISOString(),
    });
  }

  return new Response('ok');
});
