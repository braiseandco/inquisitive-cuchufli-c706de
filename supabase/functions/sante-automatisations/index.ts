// Contrôles du mail « Santé des automatisations » (Apps Script sante/sante-automatisations.gs, 8h).
// Ne lit que ce qui se voit d'ici : base, crons, téléphone SMS Gate, jeton Meta, passages du PC.
// La partie Gmail (échecs des scripts Google, alertes reçues) est faite par l'Apps Script.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const H = 3600_000;

type Niveau = 'ok' | 'alerte' | 'rappel';
const controles: { nom: string; niveau: Niveau; detail: string }[] = [];
const noter = (nom: string, niveau: Niveau, detail: string) => controles.push({ nom, niveau, detail });

const heures = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / H : Infinity);
const quand = (iso?: string | null) => iso
  ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'jamais';
const jourParis = (decalage: number) =>
  new Date(Date.now() + decalage * 86400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

// Tâches Windows du PC : le résultat 0x41301 = en cours, 0x41303 = jamais lancée
const EN_COURS = [0, 267009, 267011];

Deno.serve(async (req: Request) => {
  // La clé de l'appelant sert pour tout : seule la clé service_role peut lire ces fonctions
  const cle = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const sb = createClient(SUPABASE_URL, cle);
  const { data: crons, error } = await sb.rpc('sante_crons_en_echec');
  if (error) return new Response('interdit', { status: 401 });
  controles.length = 0;

  const { data: imp } = await sb.from('email_imports').select('imported_at').order('imported_at', { ascending: false }).limit(1);
  noter('Réservations du site', heures(imp?.[0]?.imported_at) > 48 ? 'alerte' : 'ok', `dernier import ${quand(imp?.[0]?.imported_at)}`);

  const { data: sc } = await sb.from('social_counts').select('updated_at').eq('id', 1).single();
  noter('Compteur réseaux (tablette)', heures(sc?.updated_at) > 13 ? 'alerte' : 'ok', `mis à jour ${quand(sc?.updated_at)}`);

  noter('Tâches automatiques Supabase', crons?.length ? 'alerte' : 'ok',
    crons?.length ? crons.map((c: any) => `${c.nom} (${c.echecs} échec)`).join(', ') : 'aucun échec en 24 h');

  const { data: posts } = await sb.from('social_scheduled_posts').select('id,quand')
    .eq('etat', 'a_publier').lt('quand', new Date(Date.now() - H).toISOString());
  noter('Publications programmées', posts?.length ? 'alerte' : 'ok',
    posts?.length ? `${posts.length} en retard : ${posts.map((p: any) => p.id).join(', ')}` : 'rien en retard');

  const { data: sms } = await sb.from('sms_envois').select('etat,cree_at').gt('cree_at', new Date(Date.now() - 48 * H).toISOString());
  const echoues = (sms || []).filter((s: any) => s.etat === 'Failed' && heures(s.cree_at) < 24).length;
  const bloques = (sms || []).filter((s: any) => s.etat === 'Pending' && heures(s.cree_at) > 24).length;
  noter('SMS envoyés', echoues || bloques ? 'alerte' : 'ok',
    echoues || bloques ? `${echoues} en échec, ${bloques} bloqués depuis plus de 24 h` : `${(sms || []).length} sur 48 h, aucun en échec`);

  const { data: ids } = await sb.rpc('sms_gateway_identifiants');
  try {
    const r = await fetch('https://api.sms-gate.app/3rdparty/v1/devices', {
      headers: { Authorization: 'Basic ' + btoa(`${ids?.[0]?.utilisateur}:${ids?.[0]?.mot_de_passe}`) },
    });
    const vu = r.ok ? (await r.json()).map((d: any) => d.lastSeen).sort().pop() : null;
    noter('Téléphone SMS Gate', heures(vu) > 72 ? 'alerte' : 'ok', r.ok ? `vu ${quand(vu)}` : `passerelle injoignable (${r.status})`);
  } catch (e) { noter('Téléphone SMS Gate', 'alerte', `passerelle injoignable (${e})`); }

  try {
    const r = await fetch(`https://graph.facebook.com/v22.0/me?fields=id&access_token=${Deno.env.get('META_PAGE_TOKEN')}`);
    noter('Accès Facebook / Instagram', r.ok ? 'ok' : 'alerte', r.ok ? 'jeton valide' : `refusé : ${(await r.json())?.error?.message}`);
  } catch (e) { noter('Accès Facebook / Instagram', 'alerte', `Meta injoignable (${e})`); }

  const { data: fac } = await sb.from('cmd_factures').select('numero').is('envoye_comptable_at', null)
    .neq('statut', 'document').lt('created_at', new Date(Date.now() - 48 * H).toISOString());
  noter('Factures au comptable', fac?.length ? 'alerte' : 'ok',
    fac?.length ? `${fac.length} pas transmise(s) depuis 2 jours : ${fac.map((f: any) => f.numero).join(', ')}` : 'tout est transmis');

  const { data: cmd } = await sb.from('cmd_commandes').select('numero,mail_erreur').not('mail_erreur', 'is', null)
    .gt('updated_at', new Date(Date.now() - 48 * H).toISOString());
  noter('Commandes par mail', cmd?.length ? 'alerte' : 'ok',
    cmd?.length ? cmd.map((c: any) => `${c.numero} : ${c.mail_erreur}`).join(' ; ') : 'aucune erreur');

  const { data: pc } = await sb.from('sante_battements').select('*').order('nom');
  for (const t of pc || []) {
    if (t.nom === 'PC') noter('PC du bureau', heures(t.maj_at) > 72 ? 'rappel' : 'ok', `allumé pour la dernière fois ${quand(t.maj_at)}`);
    else noter(`PC : ${t.nom}`, EN_COURS.includes(Number(t.resultat)) ? 'ok' : 'alerte',
      `dernier passage ${quand(t.dernier_passage)}${EN_COURS.includes(Number(t.resultat)) ? '' : `, code d'erreur ${t.resultat}`}`);
  }

  const hier = jourParis(-1);
  if (new Date(hier + 'T12:00:00Z').getUTCDay() !== 1) {
    const { data: cj } = await sb.from('caisse_journaliere').select('id').eq('date', hier).limit(1);
    if (!cj?.length) noter('Caisse', 'rappel', `la journée du ${hier.split('-').reverse().join('/')} n'est pas saisie`);
  }

  const { data: prix } = await sb.rpc('sante_prix_semaine', { jours: 7 });
  return new Response(JSON.stringify({ controles, prix: prix || [] }), { headers: { 'Content-Type': 'application/json' } });
});
