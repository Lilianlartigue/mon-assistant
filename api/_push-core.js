const crypto = require('crypto');
const webpush = require('web-push');
const { supabase } = require('./_calendar-sync-core');

const SLOT_HOURS = {
  morning: 8,
  midday: 13,
  evening: 19
};

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function getVapidKeys() {
  if (
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY
  ) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY
    };
  }

  const seed =
    process.env.PUSH_VAPID_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.ICLOUD_APP_PASSWORD;

  if (!seed) {
    throw new Error(
      'Aucune clé serveur disponible pour les notifications.'
    );
  }

  let privateKey = crypto
    .createHash('sha256')
    .update('mon-assistant-personal-push-v1|' + seed)
    .digest();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const ecdh = crypto.createECDH('prime256v1');

    try {
      ecdh.setPrivateKey(privateKey);

      return {
        publicKey: base64url(ecdh.getPublicKey()),
        privateKey: base64url(privateKey)
      };

    } catch (_error) {
      privateKey = crypto
        .createHash('sha256')
        .update(privateKey)
        .digest();
    }
  }

  throw new Error(
    'Impossible de générer les clés Web Push.'
  );
}

function configureWebPush() {
  const keys = getVapidKeys();

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ||
      'https://mon-assistant-eight.vercel.app',
    keys.publicKey,
    keys.privateKey
  );

  return keys;
}

function sameOriginRequest(req) {
  const host = String(req.headers.host || '');
  const origin = String(req.headers.origin || '');
  const referer = String(req.headers.referer || '');

  if (!host) return true;

  return (
    origin.includes(host) ||
    referer.includes(host)
  );
}

function validSubscription(value) {
  return Boolean(
    value &&
    typeof value.endpoint === 'string' &&
    value.endpoint.startsWith('https://') &&
    value.keys &&
    typeof value.keys.p256dh === 'string' &&
    typeof value.keys.auth === 'string'
  );
}

function safeTimezone(value) {
  const zone = String(value || 'Europe/Paris');

  try {
    new Intl.DateTimeFormat('fr-FR', {
      timeZone: zone
    }).format(new Date());

    return zone;

  } catch (_error) {
    return 'Europe/Paris';
  }
}

function localParts(date, timeZone) {
  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          safeTimezone(timeZone),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }
    ).formatToParts(date);

  function value(type) {
    return parts.find(function (part) {
      return part.type === type;
    })?.value || '';
  }

  return {
    date:
      value('year') +
      '-' +
      value('month') +
      '-' +
      value('day'),

    hour:
      Number(value('hour')),

    minute:
      Number(value('minute'))
  };
}

function timeLabel(date, timeZone) {
  return new Intl.DateTimeFormat(
    'fr-FR',
    {
      timeZone:
        safeTimezone(timeZone),
      hour: '2-digit',
      minute: '2-digit'
    }
  ).format(date);
}

function tomorrowKey(now, timeZone) {
  return localParts(
    new Date(
      now.getTime() +
      24 * 60 * 60 * 1000
    ),
    timeZone
  ).date;
}

function normalizeTime(value, fallback) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(
    String(value || '')
  )
    ? String(value)
    : fallback;
}

function minutes(value) {
  const match =
    String(value || '')
      .slice(0, 5)
      .match(/^(\d{2}):(\d{2})$/);

  return match
    ? Number(match[1]) * 60 +
        Number(match[2])
    : 0;
}

function isQuietNow(preferences, now) {
  const timeZone =
    safeTimezone(
      preferences?.timezone
    );

  const current =
    localParts(now, timeZone);

  const currentMinutes =
    current.hour * 60 +
    current.minute;

  const start =
    minutes(
      normalizeTime(
        preferences?.quietStart,
        '22:00'
      )
    );

  const end =
    minutes(
      normalizeTime(
        preferences?.quietEnd,
        '08:00'
      )
    );

  if (start === end) {
    return false;
  }

  if (start < end) {
    return (
      currentMinutes >= start &&
      currentMinutes < end
    );
  }

  return (
    currentMinutes >= start ||
    currentMinutes < end
  );
}

function eventStart(event) {
  const value =
    event &&
    (
      event.start ||
      event.start_at ||
      event.start_date
    );

  if (!value) return null;

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

function taskDue(task) {
  return task && task.due
    ? String(task.due).slice(0, 10)
    : '';
}

function shortName(value, limit) {
  const text =
    String(value || '').trim();

  if (text.length <= limit) {
    return text;
  }

  return (
    text.slice(0, limit - 1).trim() +
    '…'
  );
}

function personalize(state, slot, timeZone, now) {
  const zone =
    safeTimezone(timeZone);

  const current =
    localParts(now, zone);

  const today =
    current.date;

  const tomorrow =
    tomorrowKey(now, zone);

  const tasks =
    Array.isArray(state?.tasks)
      ? state.tasks
      : [];

  const shopping =
    Array.isArray(state?.shopping)
      ? state.shopping
      : [];

  const events =
    Array.isArray(state?.events)
      ? state.events
      : [];

  const openTasks =
    tasks.filter(function (task) {
      return !task.done;
    });

  const overdue =
    openTasks.filter(function (task) {
      const due = taskDue(task);
      return due && due < today;
    });

  const todayTasks =
    openTasks.filter(function (task) {
      return taskDue(task) === today;
    });

  const urgentNoDate =
    openTasks.filter(function (task) {
      return (
        !taskDue(task) &&
        (
          task.priority === 'Urgente' ||
          task.priority === 'Importante'
        )
      );
    });

  const openShopping =
    shopping.filter(function (item) {
      return !item.done;
    });

  const importantShopping =
    openShopping.filter(function (item) {
      return (
        item.priority === 'Urgente' ||
        item.priority === 'Importante'
      );
    });

  const parsedEvents =
    events
      .map(function (event) {
        return {
          event,
          start:
            eventStart(event)
        };
      })
      .filter(function (row) {
        return row.start;
      })
      .sort(function (a, b) {
        return (
          a.start.getTime() -
          b.start.getTime()
        );
      });

  const todayEvents =
    parsedEvents.filter(function (row) {
      return (
        localParts(
          row.start,
          zone
        ).date === today
      );
    });

  const nextTodayEvent =
    todayEvents.find(function (row) {
      return (
        row.start.getTime() >=
        now.getTime() -
          15 * 60 * 1000
      );
    });

  const tomorrowEvents =
    parsedEvents.filter(function (row) {
      return (
        localParts(
          row.start,
          zone
        ).date === tomorrow
      );
    });

  const pieces = [];
  let title = 'Mon assistant';

  if (slot === 'morning') {
    title = 'Bonjour 👋';

    if (overdue.length) {
      pieces.push(
        overdue.length +
          ' tâche' +
          (overdue.length > 1 ? 's' : '') +
          ' en retard'
      );
    }

    if (todayTasks.length) {
      pieces.push(
        'Aujourd’hui : ' +
          shortName(
            todayTasks[0].title,
            42
          ) +
          (
            todayTasks.length > 1
              ? ' +' +
                (todayTasks.length - 1)
              : ''
          )
      );

    } else if (
      !overdue.length &&
      urgentNoDate.length
    ) {
      pieces.push(
        'Priorité : ' +
          shortName(
            urgentNoDate[0].title,
            42
          )
      );
    }

    if (todayEvents[0]) {
      pieces.push(
        timeLabel(
          todayEvents[0].start,
          zone
        ) +
          ' ' +
          shortName(
            todayEvents[0].event.title,
            36
          )
      );
    }

    if (importantShopping.length) {
      pieces.push(
        importantShopping.length +
          ' course' +
          (
            importantShopping.length > 1
              ? 's importantes'
              : ' importante'
          )
      );
    }

    if (!pieces.length) {
      pieces.push(
        'Rien d’urgent ce matin. Ta journée est plutôt légère.'
      );
    }

  } else if (slot === 'midday') {
    title =
      'Point de mi-journée';

    if (
      todayTasks.length ||
      overdue.length
    ) {
      pieces.push(
        (
          todayTasks.length +
          overdue.length
        ) +
          ' tâche' +
          (
            todayTasks.length +
              overdue.length >
            1
              ? 's'
              : ''
          ) +
          ' à suivre'
      );
    }

    if (nextTodayEvent) {
      pieces.push(
        'Prochain : ' +
          timeLabel(
            nextTodayEvent.start,
            zone
          ) +
          ' ' +
          shortName(
            nextTodayEvent.event.title,
            36
          )
      );
    }

    if (importantShopping.length) {
      pieces.push(
        'Courses : ' +
          shortName(
            importantShopping[0].name,
            36
          ) +
          (
            importantShopping.length > 1
              ? ' +' +
                (importantShopping.length - 1)
              : ''
          )
      );
    }

    if (!pieces.length) {
      pieces.push(
        'Tout est calme pour le moment. Rien d’urgent à signaler.'
      );
    }

  } else {
    title =
      'Petit bilan du soir';

    const remaining =
      todayTasks.length +
      overdue.length;

    if (remaining) {
      pieces.push(
        remaining +
          ' tâche' +
          (remaining > 1 ? 's' : '') +
          ' encore ouverte' +
          (remaining > 1 ? 's' : '')
      );
    }

    if (tomorrowEvents[0]) {
      pieces.push(
        'Demain ' +
          timeLabel(
            tomorrowEvents[0].start,
            zone
          ) +
          ' : ' +
          shortName(
            tomorrowEvents[0].event.title,
            36
          )
      );
    }

    if (openShopping.length) {
      pieces.push(
        openShopping.length +
          ' article' +
          (
            openShopping.length > 1
              ? 's'
              : ''
          ) +
          ' en courses'
      );
    }

    if (!pieces.length) {
      pieces.push(
        'Tout est à jour. Tu peux clôturer la journée tranquille.'
      );
    }
  }

  return {
    title,
    body:
      shortName(
        pieces.join(' • '),
        190
      ),
    url: '/#/home',
    tag:
      'personal-' + slot
  };
}

function shouldRunSlot(slot, timeZone, now) {
  const target =
    SLOT_HOURS[slot];

  if (
    typeof target !== 'number'
  ) {
    return true;
  }

  return (
    localParts(
      now,
      timeZone
    ).hour === target
  );
}

async function getSharedState() {
  const rows =
    await supabase(
      '/finances?id=eq.main&select=data&limit=1'
    );

  return (
    rows &&
    rows[0] &&
    rows[0].data &&
    typeof rows[0].data === 'object'
  )
    ? rows[0].data
    : {};
}

module.exports = {
  webpush,
  supabase,
  getVapidKeys,
  configureWebPush,
  sameOriginRequest,
  validSubscription,
  safeTimezone,
  normalizeTime,
  localParts,
  isQuietNow,
  personalize,
  shouldRunSlot,
  getSharedState
};
