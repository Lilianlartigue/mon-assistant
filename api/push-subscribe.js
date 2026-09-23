const {
  supabase,
  sameOriginRequest,
  validSubscription,
  safeTimezone,
  normalizeTime
} = require('./_push-core');

module.exports = async function handler(req, res) {
  if (
    req.method !== 'POST' &&
    req.method !== 'DELETE'
  ) {
    return res.status(405).json({
      error:
        'Méthode non autorisée'
    });
  }

  if (!sameOriginRequest(req)) {
    return res.status(403).json({
      error:
        'Origine non autorisée'
    });
  }

  try {
    const body =
      req.body || {};

    const subscription =
      body.subscription ||
      body;

    if (
      !subscription ||
      typeof subscription.endpoint !==
        'string'
    ) {
      return res.status(400).json({
        error:
          'Abonnement invalide'
      });
    }

    if (
      req.method === 'DELETE'
    ) {
      await supabase(
        '/push_subscriptions?endpoint=eq.' +
          encodeURIComponent(
            subscription.endpoint
          ),
        {
          method:
            'DELETE'
        }
      );

      return res.status(200).json({
        ok: true
      });
    }

    if (
      !validSubscription(
        subscription
      )
    ) {
      return res.status(400).json({
        error:
          'Abonnement push invalide'
      });
    }

    const existing =
      await supabase(
        '/push_subscriptions?endpoint=eq.' +
          encodeURIComponent(
            subscription.endpoint
          ) +
          '&select=data&limit=1'
      );

    const previous =
      existing &&
      existing[0] &&
      existing[0].data &&
      typeof existing[0].data === 'object'
        ? existing[0].data
        : {};

    const preferences =
      body.preferences ||
      {};

    const data = {
      ...previous,

      endpoint:
        subscription.endpoint,

      expirationTime:
        subscription.expirationTime ||
        null,

      keys: {
        p256dh:
          subscription.keys.p256dh,
        auth:
          subscription.keys.auth
      },

      preferences: {
        timezone:
          safeTimezone(
            preferences.timezone
          ),

        quietStart:
          normalizeTime(
            preferences.quietStart,
            '22:00'
          ),

        quietEnd:
          normalizeTime(
            preferences.quietEnd,
            '08:00'
          )
      }
    };

    await supabase(
      '/push_subscriptions?on_conflict=endpoint',
      {
        method:
          'POST',

        headers: {
          Prefer:
            'resolution=merge-duplicates,return=minimal'
        },

        body:
          JSON.stringify([
            {
              endpoint:
                subscription.endpoint,

              data,

              updated_at:
                new Date()
                  .toISOString()
            }
          ])
      }
    );

    return res.status(200).json({
      ok: true
    });

  } catch (error) {
    console.error(
      'Push subscribe:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Erreur notifications'
    });
  }
};
