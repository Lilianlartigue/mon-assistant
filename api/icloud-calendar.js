const { XMLParser } = require('fast-xml-parser');
const ical = require('node-ical');

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variable Vercel manquante : ${name}`);
  return value;
}

function authHeader() {
  return 'Basic ' + Buffer.from(required('ICLOUD_EMAIL') + ':' + required('ICLOUD_APP_PASSWORD')).toString('base64');
}

async function davFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/xml; charset=utf-8',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok && response.status !== 207) {
    throw new Error(`CalDAV ${response.status} : ${text.slice(0, 500)}`);
  }
  return { response, text };
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function hrefFromProp(prop) {
  if (!prop) return null;
  if (typeof prop === 'string') return prop;
  return prop.href || null;
}

function absoluteUrl(base, href) {
  if (!href) return null;
  return new URL(href, base).toString();
}

async function discoverCalendarHome() {
  const startUrl = 'https://caldav.icloud.com/';
  const principalRequest = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;
  const principalResult = await davFetch(startUrl, {
    method: 'PROPFIND',
    headers: { Depth: '0' },
    body: principalRequest
  });
  const principalXml = parser.parse(principalResult.text);
  const principalResponse = asArray(principalXml.multistatus?.response)[0];
  const principalProps = asArray(principalResponse?.propstat).map(x => x.prop).find(Boolean) || {};
  const principalHref = hrefFromProp(principalProps['current-user-principal']);
  const principalUrl = absoluteUrl(startUrl, principalHref);
  if (!principalUrl) throw new Error('Principal CalDAV iCloud introuvable.');

  const homeRequest = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;
  const homeResult = await davFetch(principalUrl, {
    method: 'PROPFIND',
    headers: { Depth: '0' },
    body: homeRequest
  });
  const homeXml = parser.parse(homeResult.text);
  const homeResponse = asArray(homeXml.multistatus?.response)[0];
  const homeProps = asArray(homeResponse?.propstat).map(x => x.prop).find(Boolean) || {};
  const homeHref = hrefFromProp(homeProps['calendar-home-set']);
  const homeUrl = absoluteUrl(principalUrl, homeHref);
  if (!homeUrl) throw new Error('Répertoire des calendriers iCloud introuvable.');
  return homeUrl;
}

async function listCalendars(homeUrl) {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:resourcetype/><d:displayname/></d:prop>
</d:propfind>`;
  const result = await davFetch(homeUrl, {
    method: 'PROPFIND',
    headers: { Depth: '1' },
    body
  });
  const xml = parser.parse(result.text);
  return asArray(xml.multistatus?.response).map(item => {
    const propstats = asArray(item.propstat);
    const ok = propstats.find(p => String(p.status || '').includes('200')) || propstats[0] || {};
    const prop = ok.prop || {};
    const resourceType = prop.resourcetype || {};
    const isCalendar = Object.prototype.hasOwnProperty.call(resourceType, 'calendar');
    return {
      url: absoluteUrl(homeUrl, item.href),
      name: prop.displayname || 'Calendrier iCloud',
      isCalendar
    };
  }).filter(item => item.isCalendar && item.url);
}

function toStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function eventId(uid, start) {
  return `icloud-${Buffer.from(String(uid || '') + '|' + new Date(start).toISOString()).toString('base64url').slice(0, 100)}`;
}

function isAllDay(event) {
  return event.datetype === 'date' || event.start?.dateOnly === true;
}

function normalizeEvent(event, calendarName, occurrenceStart, occurrenceEnd) {
  const start = new Date(occurrenceStart || event.start);
  const originalStart = new Date(event.start);
  const originalEnd = event.end ? new Date(event.end) : null;
  let duration = originalEnd && !Number.isNaN(originalEnd.getTime()) ? originalEnd - originalStart : 60 * 60 * 1000;
  if (isAllDay(event) && (!duration || duration < 24 * 60 * 60 * 1000)) duration = 24 * 60 * 60 * 1000;
  const end = occurrenceEnd ? new Date(occurrenceEnd) : new Date(start.getTime() + duration);
  return {
    id: eventId(event.uid || event.summary, start),
    title: String(event.summary || 'Événement iCloud'),
    start: start.toISOString(),
    end: end.toISOString(),
    category: 'Personnel',
    allDay: isAllDay(event),
    source: 'icloud',
    calendar: calendarName,
    uid: event.uid || null,
    recurring: Boolean(event.rrule)
  };
}

function parseRecurringIcs(calendarData, calendarName, startRange, endRange) {
  const parsed = ical.sync.parseICS(String(calendarData || ''));
  const output = [];
  for (const event of Object.values(parsed)) {
    if (!event || event.type !== 'VEVENT' || !event.start) continue;
    if (!event.rrule || typeof event.rrule.between !== 'function') continue;

    const excluded = new Set(Object.values(event.exdate || {}).map(value => new Date(value).getTime()));
    let occurrences = [];
    try {
      occurrences = event.rrule.between(startRange, endRange, true) || [];
    } catch (_) {
      continue;
    }

    for (const occurrence of occurrences) {
      const occurrenceDate = new Date(occurrence);
      if (excluded.has(occurrenceDate.getTime())) continue;

      let override = null;
      for (const candidate of Object.values(event.recurrences || {})) {
        if (!candidate?.recurrenceid) continue;
        if (new Date(candidate.recurrenceid).getTime() === occurrenceDate.getTime()) {
          override = candidate;
          break;
        }
      }

      if (override) {
        output.push(normalizeEvent(override, calendarName, override.start, override.end));
      } else {
        output.push(normalizeEvent(event, calendarName, occurrenceDate));
      }
    }
  }
  return output;
}

function parseExpandedIcs(calendarData, calendarName) {
  const parsed = ical.sync.parseICS(String(calendarData || ''));
  const output = [];
  for (const event of Object.values(parsed)) {
    if (!event || event.type !== 'VEVENT' || !event.start) continue;
    output.push(normalizeEvent(event, calendarName));
  }
  return output;
}

function calendarDataFromResponse(response) {
  const propstats = asArray(response.propstat);
  const ok = propstats.find(p => String(p.status || '').includes('200')) || propstats[0] || {};
  return ok.prop?.['calendar-data'] || null;
}

async function queryExpandedWindow(calendar, start, end) {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data><c:expand start="${toStamp(start)}" end="${toStamp(end)}"/></c:calendar-data></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${toStamp(start)}" end="${toStamp(end)}"/></c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;
  const result = await davFetch(calendar.url, { method: 'REPORT', headers: { Depth: '1' }, body });
  const xml = parser.parse(result.text);
  const events = [];
  for (const response of asArray(xml.multistatus?.response)) {
    const calendarData = calendarDataFromResponse(response);
    if (calendarData) events.push(...parseExpandedIcs(calendarData, calendar.name));
  }
  return events;
}

async function queryRecurringMasters(calendar, start, end) {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:prop-filter name="RRULE"/></c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;
  const result = await davFetch(calendar.url, { method: 'REPORT', headers: { Depth: '1' }, body });
  const xml = parser.parse(result.text);
  const events = [];
  for (const response of asArray(xml.multistatus?.response)) {
    const calendarData = calendarDataFromResponse(response);
    if (calendarData) events.push(...parseRecurringIcs(calendarData, calendar.name, start, end));
  }
  return events;
}

function yearWindows(start, end) {
  const windows = [];
  let cursor = new Date(start);
  while (cursor < end) {
    const next = new Date(Math.min(end.getTime(), new Date(cursor.getFullYear() + 1, cursor.getMonth(), cursor.getDate()).getTime()));
    windows.push([new Date(cursor), next]);
    cursor = next;
  }
  return windows;
}

async function fetchCalendarEvents(calendar, start, end) {
  const windows = yearWindows(start, end);
  const expanded = [];
  for (const [windowStart, windowEnd] of windows) {
    expanded.push(...await queryExpandedWindow(calendar, windowStart, windowEnd));
  }

  let recurring = [];
  try {
    recurring = await queryRecurringMasters(calendar, start, end);
  } catch (error) {
    console.warn(`RRULE ${calendar.name}:`, error.message);
  }

  const map = new Map();
  for (const event of expanded.concat(recurring)) map.set(event.id, event);
  return Array.from(map.values());
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });
  try {
    const now = new Date();
    const defaultStart = new Date(now.getFullYear() - 5, 0, 1);
    const defaultEnd = new Date(now.getFullYear() + 4, 0, 1);
    const start = req.query.start ? new Date(req.query.start) : defaultStart;
    const end = req.query.end ? new Date(req.query.end) : defaultEnd;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: 'Période invalide' });
    }

    const homeUrl = await discoverCalendarHome();
    const calendars = await listCalendars(homeUrl);
    const batches = [];
    for (const calendar of calendars) {
      try {
        const events = await fetchCalendarEvents(calendar, start, end);
        batches.push({ calendar: calendar.name, events, error: null });
      } catch (error) {
        batches.push({ calendar: calendar.name, events: [], error: error.message });
      }
    }

    const map = new Map();
    for (const batch of batches) for (const event of batch.events) map.set(event.id, event);
    const events = Array.from(map.values()).sort((a, b) => String(a.start).localeCompare(String(b.start)));

    return res.status(200).json({
      ok: true,
      count: events.length,
      calendars: batches.map(b => ({ name: b.calendar, count: b.events.length, error: b.error })),
      events
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Erreur iCloud Calendar' });
  }
};
