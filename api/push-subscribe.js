const { supabase, validSubscription, normalizeTime, sameOriginRequest } = require('./_push-core');

module.exports = async function handler(req, res) {
  if (!['POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!sameOriginRequest(req)) return res.status(403).json({ error: 'Origine non autorisée' });

  try {
    const body = req.body || {};
    const subscription = body.subscription || body;
    if (!validSubscription(subscription)) return res.status(400).json({ error: 'Abonnement push invalide' });

    const endpoint = subscription.endpoint;
    if (req.method === 'DELETE') {
      await supabase('/push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint), { method: 'DELETE' });
      return res.status(200).json({ ok: true });
    }

    const row = {
      endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      timezone: typeof body.timezone === 'string' && body.timezone ? body.timezone : 'Europe/Paris',
      quiet_start: normalizeTime(body.quietStart, '22:00'),
      quiet_end: normalizeTime(body.quietEnd, '08:00'),
      enabled: true,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
      updated_at: new Date().toISOString(),
      last_error: null
    };

    await supabase('/push_subscriptions?on_conflict=endpoint', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([row])
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Push subscribe:', error);
    return res.status(500).json({ error: error.message || 'Erreur notifications' });
  }
};
