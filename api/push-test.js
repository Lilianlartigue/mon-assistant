const {
  webpush,
  supabase,
  configureWebPush,
  sameOriginRequest,
  validSubscription,
  safeTimezone,
  personalize,
  getSharedState
} = require('./_push-core');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
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
    const endpoint =
      String(
        req.body?.endpoint ||
        ''
      );

    if (!endpoint) {
      return res.status(400).json({
        error:
          'Abonnement introuvable'
      });
    }

    const rows =
      await supabase(
        '/push_subscriptions?endpoint=eq.' +
          encodeURIComponent(
            endpoint
          ) +
          '&select=endpoint,data&limit=1'
      );

    const row =
      rows && rows[0];

    if (
      !row ||
      !validSubscription(
        row.data
      )
    ) {
      return res.status(404).json({
        error:
          'Active d’abord les notifications sur cet appareil.'
      });
    }

    configureWebPush();

    const state =
      await getSharedState();

    const timeZone =
      safeTimezone(
        row.data
          ?.preferences
          ?.timezone
      );

    const hour =
      Number(
        new Intl.DateTimeFormat(
          'en-GB',
          {
            timeZone,
            hour:
              '2-digit',
            hourCycle:
              'h23'
          }
        ).format(
          new Date()
        )
      );

    const slot =
      hour < 11
        ? 'morning'
        : hour < 17
          ? 'midday'
          : 'evening';

    const payload =
      personalize(
        state,
        slot,
        timeZone,
        new Date()
      );

    payload.title =
      'Test • ' +
      payload.title;

    payload.tag =
      'personal-test';

    await webpush
      .sendNotification(
        {
          endpoint:
            row.data.endpoint,

          expirationTime:
            row.data.expirationTime ||
            null,

          keys:
            row.data.keys
        },

        JSON.stringify(
          payload
        ),

        {
          TTL:
            60 * 10
        }
      );

    return res.status(200).json({
      ok: true,
      preview:
        payload.body
    });

  } catch (error) {
    console.error(
      'Push test:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Impossible d’envoyer le test'
    });
  }
};
