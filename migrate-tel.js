// Migration: normalise tous les numéros de téléphone en base Supabase
// Supprime espaces, points, tirets des numéros existants

const SUPABASE_URL = "https://ipnuwxirmfumxsguudvi.supabase.co";
const SUPABASE_KEY = "sb_publishable_iIxaYsXCZMBekFbl8596zQ_z7ENQ9n1";

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
  'Prefer': ''
};

function normalizeTel(tel) {
  if (!tel) return tel;
  return tel.replace(/[\s.\-]/g, '');
}

async function getAllClients() {
  const res = await fetch(SUPABASE_URL + '/rest/v1/clients?select=id,tel&order=created_at.desc', { headers });
  if (!res.ok) throw new Error('Erreur lecture clients: ' + await res.text());
  return res.json();
}

async function updateTel(id, tel) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/clients?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ tel })
  });
  if (!res.ok) throw new Error('Erreur update ' + id + ': ' + await res.text());
}

async function main() {
  console.log('Récupération des clients...');
  const clients = await getAllClients();
  console.log(`${clients.length} client(s) trouvé(s)\n`);

  let updated = 0, skipped = 0, errors = 0;

  for (const client of clients) {
    const normalized = normalizeTel(client.tel);
    if (normalized === client.tel) {
      skipped++;
      continue;
    }
    try {
      await updateTel(client.id, normalized);
      console.log(`✓ ${client.id} : "${client.tel}" → "${normalized}"`);
      updated++;
    } catch (e) {
      console.error(`✗ ${client.id} : ${e.message}`);
      errors++;
    }
  }

  console.log(`\nMigration terminée : ${updated} mis à jour, ${skipped} déjà OK, ${errors} erreur(s)`);
}

main().catch(e => { console.error('Erreur fatale:', e.message); process.exit(1); });
