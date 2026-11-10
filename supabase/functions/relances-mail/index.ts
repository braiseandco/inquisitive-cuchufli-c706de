// Relance J+30 par mail (Brevo) : « vous nous manquez », apéro offert pendant 7 jours.
// Remise en place le 10/11/2026 en mail seulement : les SMS J+30 restent supprimés.
//
// Appelée par le bouton « Tout envoyer » de la section Relances J+30 de l'onglet Relances.
// La liste vient de la fonction SQL relance_j30_mail(), la même que celle affichée par l'appli :
// on ne peut pas lui faire écrire à une adresse choisie.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { expediteurMailBrevo } from '../_shared/brevo.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_PAR_ENVOI = 100;
const DESINSCRIPTION = 'https://app.braiseandco.fr/desinscription.html';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Même signature que desinscription_mail() côté SQL : HMAC-SHA256 de l'adresse en minuscules
async function lienDesinscription(email: string, secret: string): Promise<string> {
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(email)));
  const k = [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
  return DESINSCRIPTION + '?e=' + encodeURIComponent(email) + '&k=' + k;
}

// Texte de l'ancien SMS J+30, « présentez ce SMS » devenu « présentez ce mail »
function contenu(nom: string | null, fin: string, lien: string) {
  const salut = nom ? 'Bonjour ' + nom + ',' : 'Bonjour,';
  const sujet = 'Vous nous manquez chez Braise & Co 🔥';
  const texte = salut + '\n\n' +
    'Ça fait un moment qu\'on ne vous a pas vu au Braise & Co, vous nous manquez !\n\n' +
    'Si vous venez avant le ' + fin + ', présentez-nous ce mail et on vous offre votre apéro ! (un seul apéro par table) 🔥\n\n' +
    'Réservez sur notre site www.braiseandco-biganos.fr ou par téléphone au 09 86 12 97 14.\n\n' +
    'À très bientôt autour du feu !\nL\'équipe Braise & Co\n\n' +
    '—\nVous ne voulez plus recevoir nos mails ? ' + lien;
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:560px;margin:0 auto;padding:16px;">' +
    '<p>' + esc(salut) + '</p>' +
    '<p>Ça fait un moment qu\'on ne vous a pas vu au <b>Braise &amp; Co</b>, vous nous manquez !</p>' +
    '<p style="background:#fff3e6;border-left:4px solid #ff6b00;padding:12px 14px;">Si vous venez <b>avant le ' + esc(fin) +
    '</b>, présentez-nous ce mail et <b>on vous offre votre apéro</b> ! (un seul apéro par table) 🔥</p>' +
    '<p>Réservez sur notre site <a href="https://www.braiseandco-biganos.fr" style="color:#ff6b00;">www.braiseandco-biganos.fr</a> ' +
    'ou par téléphone au <a href="tel:+33986129714" style="color:#ff6b00;">09 86 12 97 14</a>.</p>' +
    '<p>À très bientôt autour du feu !<br>L\'équipe Braise &amp; Co</p>' +
    '<p style="font-size:12px;color:#888;margin-top:28px;">Vous ne voulez plus recevoir nos mails ? ' +
    '<a href="' + esc(lien) + '" style="color:#888;">Se désinscrire</a></p></div>';
  return { sujet, texte, html };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  // Appareils connectés seulement (pas la clé publique)
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'appareil_non_connecte' }, 401);

  const envoyerMail = await expediteurMailBrevo(sb);
  const { data: secret } = await sb.rpc('sms_gate_webhook_token');
  if (!envoyerMail || !secret) return json({ error: 'passerelle_non_configuree' }, 503);

  const { data: clients, error } = await sb.rpc('relance_j30_mail');
  if (error) return json({ error: error.message }, 500);
  // Bouton d'un seul client : seulement s'il est bien dans la liste
  const corps = await req.json().catch(() => ({}));
  const seul = typeof corps?.email === 'string' ? corps.email.trim().toLowerCase() : null;

  const fin = new Date(Date.now() + 7 * 86400_000)
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  let envoyes = 0;
  const erreurs: string[] = [];
  const liste = ((clients || []) as { email: string; nom: string | null }[]).filter((c) => !seul || c.email === seul);

  for (const c of liste.slice(0, MAX_PAR_ENVOI)) {
    const lien = await lienDesinscription(c.email, secret);
    const m = contenu(c.nom, fin, lien);
    try {
      await envoyerMail({ to: c.email, nom: c.nom || undefined, ...m, tag: 'relance_j30', desinscription: lien });
    } catch (e) {
      erreurs.push(c.email + ' : ' + String(e).slice(0, 120));
      continue;
    }
    // Toutes ses résas : sa prochaine résa, sans drapeau, le rendra relançable 30 jours après
    await sb.from('reservations').update({ relance_mois_envoye: true }).ilike('email', c.email.replace(/[\\%_]/g, '\\$&'));
    envoyes++;
  }

  return json({ envoyes, erreurs, restants: Math.max(0, liste.length - MAX_PAR_ENVOI) });
});
