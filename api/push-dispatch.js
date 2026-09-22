const { webpush, supabase, configureWebPush } = require('./_push-core');

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return String(req.headers.authorization || '') === 'Bearer ' + secret;
}

function localParts(timeZone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now);
  const value = name => parts.find(p => p.type === name)?.value || '';
  return {
    date: value('year') + '-' + value('month') + '-' + value('day'),
    minutes: Number(value('hour')) * 60 + Number(value('minute'))
  };
}

function parseMinutes(value, fallback) {
  const match = String(value || fallback).slice(0, 5).match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function inQuietHours(current, start, end) {
  if (start === end) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function slotFromRequest(req) {
  const schedule = String(req.headers['x-vercel-cron-schedule'] || '');
  if (schedule.includes(' 7 ')) return 'morning';
  if (schedule.includes(' 12 ')) return 'midday';
  if (schedule.includes(' 18 ')) return 'evening';
  return String(req.query?.slot || 'manual');
}

function payloadFor(slot) {
  if (slot === 'morning') return {
    title: 'Bonjour 👋',
    body: 'Regarde tes tâches et ton agenda pour bien démarrer la journée.',
    tag: 'daily-morning'
  };
  if (slot === 'midday') return {
    title: 'Point de mi-journée',
    body: 'Un petit coup d’œil à Mon assistant pour voir ce qu’il reste à faire.',
    tag: 'daily-midday'
  };
  return {
    title: 'Petit bilan du soir',
    body: 'Vérifie les tâches restantes et prépare tranquillement demain.',
    tag: 'daily-evening'
  };
}

async function patch(endpoint, values) {
  await supabase('/push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint), {
    method: 'PATCH',
    body: JSON.stringify({ ...values, updated_at: new Date().toISOString() })
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Non autorisé' });

  try {
    configureWebPush();
    const slot = slotFromRequest(req);
    const message = payloadFor(slot);
    const rows = await supabase('/push_subscriptions?enabled=eq.true&select=endpoint,p256dh,auth,timezone,quiet_start,quiet_end,last_slot_key') || [];

    let sent = 0;
    let skipped = 0;
    let removed = 0;
    let failed = 0;

    for (const row of rows) {
      const local = localParts(row.timezone);
      const quietStart = parseMinutes(row.quiet_start, '22:00');
      const quietEnd = parseMinutes(row.quiet_end, '08:00');
      const slotKey = local.date + '|' + slot;

      if (row.last_slot_key === slotKey || inQuietHours(local.minutes, quietStart, quietEnd)) {
        skipped += 1;
        continue;
      }

      try {
        await webpush.sendNotification({
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth }
        }, JSON.stringify({ ...message, url: '/#/home' }), { TTL: 60 * 60 * 4 });

        await patch(row.endpoint, {
          last_slot_key: slotKey,
          last_sent_at: new Date().toISOString(),
          last_error: null
        });
        sent += 1;
      } catch (error) {
        if (error && (error.statusCode === 404 || error.statusCode === 410)) {
          await supabase('/push_subscriptions?endpoint=eq.' + encodeURIComponent(row.endpoint), { method: 'DELETE' });
          removed += 1;
        } else {
          await patch(row.endpoint, { last_error: String(error?.message || error).slice(0, 1000) }).catch(() => {});
          failed += 1;
        }
      }
    }

    return res.status(200).json({ ok: true, slot, total: rows.length, sent, skipped, removed, failed });
  } catch (error) {
    console.error('Push dispatch:', error);
    return res.status(500).json({ error: error.message || 'Erreur envoi notifications' });
  }
};
