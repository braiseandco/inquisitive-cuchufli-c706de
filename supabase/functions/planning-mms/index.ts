// Envoi du planning de la semaine en MMS depuis le téléphone du resto (appli SMS Gate, mode Cloud).
//
// Appelée par le bouton « Valider et envoyer » de l'aperçu du planning (appli Planning, sur le PC).
// L'image arrive déjà compressée. Le destinataire est fixé ici : la fonction ne peut pas servir
// à envoyer une image à un numéro choisi par la page.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SMSGATE_URL = 'https://api.sms-gate.app/3rdparty/v1/message';
const DESTINATAIRE = '+33766860735';
const TAILLE_MAX = 600_000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'appareil_non_connecte' }, 401);

  const { image, titre } = await req.json().catch(() => ({}));
  if (typeof image !== 'string' || !image || image.length > TAILLE_MAX) return json({ error: 'image_invalide' }, 400);

  const { data: ids } = await sb.rpc('sms_gateway_identifiants');
  const cred = ids?.[0];
  if (!cred?.utilisateur || !cred?.mot_de_passe) return json({ error: 'passerelle_non_configuree' }, 503);

  const res = await fetch(SMSGATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa(cred.utilisateur + ':' + cred.mot_de_passe) },
    body: JSON.stringify({
      mmsMessage: {
        text: 'Planning Braise & Co' + (titre ? ' — ' + String(titre).slice(0, 80) : ''),
        attachments: [{ contentType: 'image/jpeg', name: 'planning.jpg', data: image }],
      },
      phoneNumbers: [DESTINATAIRE],
    }),
  });
  if (!res.ok) return json({ error: 'HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200) }, 502);
  return json({ ok: true, id: (await res.json().catch(() => ({}))).id });
});
