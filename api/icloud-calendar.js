const { XMLParser } = require('fast-xml-parser');

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
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
  <d:prop><d:resourcetype/><d:displayname/><cs:getctag/></d:prop>
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

function toCalDavStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function unfoldIcs(text) {
  return String(text || '').replace(/\r?\n[ \t]/g, '');
}

function unescapeIcs(value) {
  return String(value || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseIcalDate(raw, params = '') {
  if (!raw) return null;
  const value = String(raw).trim();
  const allDay = /VALUE=DATE/i.test(params) || /^\d{8}$/.test(value);
  if (allDay) {
    const y = value.slice(0, 4), m = value.slice(4, 6), d = value.slice(6, 8);
    return { iso: `${y}-${m}-${d}T00:00:00`, allDay: true };
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!match) return { iso: value, allDay: false };
  const [, y, m, d, hh, mm, ss = '00', z] = match;
  if (z) return { iso: new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`).toISOString(), allDay: false };
  return { iso: `${y}-${m}-${d}T${hh}:${mm}:${ss}`, allDay: false };
}

function addDefaultEnd(startInfo) {
  const start = new Date(startInfo.iso);
  if (Number.isNaN(start.getTime())) return startInfo.iso;
  start.setTime(start.getTime() + (startInfo.allDay ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000));
  if (startInfo.allDay) {
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}T00:00:00`;
  }
  return start.toISOString();
}

function parseExpandedEvents(calendarData, calendarName) {
  const unfolded = unfoldIcs(calendarData);
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  return blocks.map(block => {
    const lines = block.split(/\r?\n/);
    const fields = {};
    for (const line of lines) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const left = line.slice(0, colon);
      const value = line.slice(colon + 1);
      const semi = left.indexOf(';');
      const key = (semi >= 0 ? left.slice(0, semi) : left).toUpperCase();
      const params = semi >= 0 ? left.slice(semi + 1) : '';
      if (!fields[key]) fields[key] = [];
      fields[key].push({ value, params });
    }
    const startRaw = fields.DTSTART?.[0];
    const endRaw = fields.DTEND?.[0];
    const start = parseIcalDate(startRaw?.value, startRaw?.params);
    if (!start) return null;
    const end = endRaw ? parseIcalDate(endRaw.value, endRaw.params)?.iso : addDefaultEnd(start);
    const uid = unescapeIcs(fields.UID?.[0]?.value || `${calendarName}-${start.iso}`);
    const recurrenceId = fields['RECURRENCE-ID']?.[0]?.value || startRaw?.value || start.iso;
    return {
      id: `icloud-${Buffer.from(uid + '|' + recurrenceId).toString('base64url').slice(0, 80)}`,
      title: unescapeIcs(fields.SUMMARY?.[0]?.value || 'Événement iCloud'),
      start: start.iso,
      end,
      category: 'Personnel',
      allDay: start.allDay,
      source: 'icloud',
      calendar: calendarName,
      uid
    };
  }).filter(Boolean);
}

async function fetchCalendarEvents(calendar, start, end) {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data>
      <c:expand start="${toCalDavStamp(start)}" end="${toCalDavStamp(end)}"/>
    </c:calendar-data>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${toCalDavStamp(start)}" end="${toCalDavStamp(end)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
  const result = await davFetch(calendar.url, {
    method: 'REPORT',
    headers: { Depth: '1' },
    body
  });
  const xml = parser.parse(result.text);
  const events = [];
  for (const response of asArray(xml.multistatus?.response)) {
    const propstats = asArray(response.propstat);
    const ok = propstats.find(p => String(p.status || '').includes('200')) || propstats[0] || {};
    const calendarData = ok.prop?.['calendar-data'];
    if (calendarData) events.push(...parseExpandedEvents(calendarData, calendar.name));
  }
  return events;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });
  try {
    const now = new Date();
    const defaultStart = new Date(now.getFullYear() - 1, 0, 1);
    const defaultEnd = new Date(now.getFullYear() + 2, 0, 1);
    const start = req.query.start ? new Date(req.query.start) : defaultStart;
    const end = req.query.end ? new Date(req.query.end) : defaultEnd;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: 'Période invalide' });
    }

    const homeUrl = await discoverCalendarHome();
    const calendars = await listCalendars(homeUrl);
    const batches = await Promise.all(calendars.map(calendar => fetchCalendarEvents(calendar, start, end)
      .then(events => ({ calendar: calendar.name, events, error: null }))
      .catch(error => ({ calendar: calendar.name, events: [], error: error.message }))));

    const map = new Map();
    for (const batch of batches) {
      for (const event of batch.events) map.set(event.id, event);
    }
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
