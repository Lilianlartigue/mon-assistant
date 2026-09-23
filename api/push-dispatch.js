const {
  webpush,
  supabase,
  configureWebPush,
  validSubscription,
  safeTimezone,
  localParts,
  isQuietNow,
  personalize,
  shouldRunSlot,
  getSharedState
} = require('./_push-core');

function authorized(req) {
  const secret =
    process.env.CRON_SECRET;

  if (!secret) {
    return Boolean(
      req.headers[
        'x-vercel-cron-schedule'
      ]
    );
  }

  return (
    String(
      req.headers.authorization ||
      ''
    ) ===
    'Bearer ' + secret
  );
}

async function updateSubscription(
  endpoint,
  data
) {
  await supabase(
    '/push_subscriptions?endpoint=eq.' +
      encodeURIComponent(endpoint),
    {
      method:
        'PATCH',

      body:
        JSON.stringify({
          data,
          updated_at:
            new Date()
              .toISOString()
        })
    }
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error:
        'Méthode non autorisée'
    });
  }

  if (!authorized(req)) {
    return res.status(401).json({
      error:
        'Non autorisé'
    });
  }

  const requested =
    String(req.query?.slot || '');

  const schedule =
    String(
      req.headers[
        'x-vercel-cron-schedule'
      ] || ''
    );

  let slot =
    ['morning', 'midday', 'evening']
      .includes(requested)
      ? requested
      : 'midday';

  if (!requested) {
    if (
      /^0 (6|7) \* \* \*$/.test(
        schedule
      )
    ) {
      slot = 'morning';

    } else if (
      /^0 (11|12) \* \* \*$/.test(
        schedule
      )
    ) {
      slot = 'midday';

    } else if (
      /^0 (17|18) \* \* \*$/.test(
        schedule
      )
    ) {
      slot = 'evening';
    }
  }

  const now =
    new Date();

  try {
    configureWebPush();

    const [
      state,
      rows
    ] =
      await Promise.all([
        getSharedState(),

        supabase(
          '/push_subscriptions?select=endpoint,data'
        )
      ]);

    const result = {
      total:
        rows?.length || 0,
      sent: 0,
      skipped: 0,
      removed: 0,
      failed: 0
    };

    for (
      const row of rows || []
    ) {
      const data =
        row.data || {};

      if (
        !validSubscription(data)
      ) {
        result.failed += 1;
        continue;
      }

      const preferences =
        data.preferences ||
        {};

      const timeZone =
        safeTimezone(
          preferences.timezone
        );

      if (
        !shouldRunSlot(
          slot,
          timeZone,
          now
        )
      ) {
        result.skipped += 1;
        continue;
      }

      if (
        isQuietNow(
          preferences,
          now
        )
      ) {
        result.skipped += 1;
        continue;
      }

      const day =
        localParts(
          now,
          timeZone
        ).date;

      const slotKey =
        day + '|' + slot;

      if (
        data.lastSlotKey ===
        slotKey
      ) {
        result.skipped += 1;
        continue;
      }

      const payload =
        personalize(
          state,
          slot,
          timeZone,
          now
        );

      try {
        await webpush
          .sendNotification(
            {
              endpoint:
                data.endpoint,

              expirationTime:
                data.expirationTime ||
                null,

              keys:
                data.keys
            },

            JSON.stringify(
              payload
            ),

            {
              TTL:
                60 * 60 * 4
            }
          );

        data.lastSlotKey =
          slotKey;

        data.lastSentAt =
          now.toISOString();

        await updateSubscription(
          row.endpoint,
          data
        );

        result.sent += 1;

      } catch (error) {
        if (
          error &&
          (
            error.statusCode === 404 ||
            error.statusCode === 410
          )
        ) {
          await supabase(
            '/push_subscriptions?endpoint=eq.' +
              encodeURIComponent(
                row.endpoint
              ),
            {
              method:
                'DELETE'
            }
          );

          result.removed += 1;

        } else {
          console.error(
            'Push send:',
            error &&
            error.message
              ? error.message
              : error
          );

          result.failed += 1;
        }
      }
    }

    return res.status(200).json({
      ok: true,
      slot,
      ...result
    });

  } catch (error) {
    console.error(
      'Push dispatch:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Erreur envoi notifications'
    });
  }
};
