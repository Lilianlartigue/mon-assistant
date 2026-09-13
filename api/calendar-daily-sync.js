const crypto = require('crypto');
const { collectIcloudSnapshot, supabase } = require('./_calendar-sync-core');

function isAuthorized(req) {
  if (String(req.query?.manual || '') === '1') {
    const referer = String(req.headers.referer || '');
    const host = String(req.headers.host || '');
    return !host || referer.includes(host);
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}`;
}

async function upsertChunks(rows) {
  const size = 200;
  for (let i = 0; i < rows.length; i += size) {
    await supabase('/calendar_sync_items?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + size))
    });
  }
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Non autorisé' });

  const token = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  try {
    const snapshot = await collectIcloudSnapshot();
    const rows = snapshot.items.map(item => ({
      ...item,
      source: 'icloud',
      sync_token: token,
      updated_at: startedAt
    }));

    await upsertChunks(rows);
    await supabase(`/calendar_sync_items?source=eq.icloud&sync_token=neq.${encodeURIComponent(token)}`, { method: 'DELETE' });

    const birthdayCount = rows.filter(row => row.kind === 'birthday').length;
    await supabase('/calendar_sync_state?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{
        id: 'icloud',
        synced_at: startedAt,
        item_count: rows.length,
        calendar_count: rows.length - birthdayCount,
        birthday_count: birthdayCount,
        status: 'ok',
        details: { calendars: snapshot.calendars, addressBooks: snapshot.addressBooks }
      }])
    });

    return res.status(200).json({
      ok: true,
      syncedAt: startedAt,
      itemCount: rows.length,
      birthdayCount,
      calendars: snapshot.calendars,
      addressBooks: snapshot.addressBooks
    });
  } catch (error) {
    console.error('Daily calendar sync:', error);
    try {
      await supabase('/calendar_sync_state?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{ id: 'icloud', synced_at: startedAt, status: 'error', details: { error: error.message } }])
      });
    } catch (_) {}
    return res.status(500).json({ error: error.message || 'Erreur de synchronisation iCloud' });
  }
};
