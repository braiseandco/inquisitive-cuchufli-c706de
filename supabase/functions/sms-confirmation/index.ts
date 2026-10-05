// Envoi automatique de la confirmation d'une réservation : SMS depuis le téléphone Android du
// resto (appli SMS Gateway, mode Cloud) et, pour les réservations confirmées automatiquement,
// mail via le même script Google que l'appli.
//
// Appelée par le déclencheur trg_sms_confirmation_auto avec { id, mail }. Elle ne fait rien pour
// une résa qui n'est pas « a-envoyer » : l'appeler à la main ne peut pas faire partir de SMS.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SCRIPT_EMAIL_URL = 'https://script.google.com/macros/s/AKfycbwqlFIa_sq05UVv4OzgtbZBhCo5nH5SwAaffaxg3VYHRVvu04gGUcA38LQjaHu9pzTF/exec';
const SMSGATE_URL = 'https://api.sms-gate.app/3rdparty/v1/message';
// Garde-fou : au-delà, la résa repasse en envoi manuel (clé publique utilisable par n'importe qui)
const MAX_SMS_PAR_HEURE = 30;

// Mobiles français uniquement (06 / 07), au format international attendu par la passerelle
function numeroMobile(tel: string): string | null {
  let d = tel.replace(/[^\d+]/g, '');
  if (d.startsWith('+33')) d = '0' + d.slice(3);
  else if (d.startsWith('0033')) d = '0' + d.slice(4);
  else if (/^33[67]\d{8}$/.test(d)) d = '0' + d.slice(2);
  return /^0[67]\d{8}$/.test(d) ? '+33' + d.slice(1) : null;
}

const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let body: { id?: string; mail?: boolean } = {};
  try { body = await req.json(); } catch { return json({ skipped: 'bad_body' }); }
  if (!body.id) return json({ skipped: 'no_id' });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Prise en charge : une seule exécution par demande d'envoi
  const { data: rows, error: claimErr } = await sb.from('reservations')
    .update({ sms_auto: 'envoi' })
    .eq('id', body.id).eq('sms_auto', 'a-envoyer').eq('statut', 'confirmee')
    .select('*');
  if (claimErr) return json({ error: claimErr.message });
  const r = rows?.[0];
  if (!r) return json({ skipped: 'rien_a_envoyer' });

  // ── Mail (confirmations automatiques seulement) ──
  let mail = 'non';
  if (body.mail && r.email && !r.mail_confirmation_envoye) {
    try {
      const res = await fetch(SCRIPT_EMAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ nom: r.nom, email: r.email, date: r.date, heure: r.heure, pax: r.personnes, notes: r.notes || '' }),
      });
      if (res.ok) {
        await sb.from('reservations').update({ mail_confirmation_envoye: true }).eq('id', r.id);
        mail = 'envoye';
      } else mail = 'HTTP ' + res.status;
    } catch (e) { mail = String(e); }
  }

  // ── SMS ──
  const echec = async (raison: string) => {
    await sb.from('reservations').update({ sms_auto: 'erreur', sms_auto_erreur: raison, sms_envoye: false }).eq('id', r.id);
    return json({ id: r.id, mail, sms: 'erreur', raison });
  };

  const tel = numeroMobile(r.telephone || '');
  if (!tel) return echec('numero_non_mobile');

  const { data: ids } = await sb.rpc('sms_gateway_identifiants');
  const cred = ids?.[0];
  if (!cred?.utilisateur || !cred?.mot_de_passe) return echec('passerelle_non_configuree');

  const uneHeure = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await sb.from('reservations').select('id', { count: 'exact', head: true })
    .eq('sms_auto', 'envoye').gte('sms_auto_at', uneHeure);
  if ((count ?? 0) >= MAX_SMS_PAR_HEURE) return echec('limite_horaire');

  const [, mm, dd] = String(r.date).split('-');
  const texte = 'Votre reservation chez Braise et Co est confirmee le ' + dd + '/' + mm + ' a ' + String(r.heure).slice(0, 5) +
    ' pour ' + r.personnes + ' pers. A bientot !';

  try {
    const res = await fetch(SMSGATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + btoa(cred.utilisateur + ':' + cred.mot_de_passe),
      },
      body: JSON.stringify({ textMessage: { text: texte }, phoneNumbers: [tel] }),
    });
    if (!res.ok) return echec('passerelle HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
  } catch (e) {
    return echec('passerelle ' + String(e).slice(0, 200));
  }

  await sb.from('reservations')
    .update({ sms_auto: 'envoye', sms_auto_at: new Date().toISOString(), sms_envoye: true })
    .eq('id', r.id);
  return json({ id: r.id, mail, sms: 'envoye' });
});
