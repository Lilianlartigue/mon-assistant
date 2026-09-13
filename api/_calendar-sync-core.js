const { XMLParser } = require('fast-xml-parser');
const crypto = require('crypto');

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variable Vercel manquante : ${name}`);
  return value;
}

function asArray(value) { return value == null ? [] : (Array.isArray(value) ? value : [value]); }
function propOf(response) {
  const propstats = asArray(response?.propstat);
  const ok = propstats.find(p => String(p.status || '').includes('200')) || propstats[0] || {};
  return ok.prop || {};
}
function textValue(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textValue).join('');
  if (value && typeof value === 'object') {
    if (typeof value['#text'] === 'string') return value['#text'];
    if (typeof value.__cdata === 'string') return value.__cdata;
    if (typeof value['#cdata'] === 'string') return value['#cdata'];
    return Object.entries(value).filter(([key]) => !key.startsWith('@_')).map(([, v]) => textValue(v)).join('');
  }
  return '';
}
function hrefOf(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.href || textValue(value) || null;
}
function absolute(base, href) { return href ? new URL(href, base).toString() : null; }
function stableId(prefix, value) { return prefix + '-' + crypto.createHash('sha1').update(String(value)).digest('hex'); }

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
  if (!response.ok && response.status !== 207) throw new Error(`DAV ${response.status} : ${text.slice(0, 500)}`);
  return text;
}

async function discoverHome(root, homeProp, namespace) {
  const principalXml = parser.parse(await davFetch(root, {
    method: 'PROPFIND', headers: { Depth: '0' },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>'
  }));
  const principal = asArray(principalXml.multistatus?.response)[0];
  const principalUrl = absolute(root, hrefOf(propOf(principal)['current-user-principal']));
  if (!principalUrl) throw new Error('Principal iCloud introuvable.');

  const prefix = namespace === 'calendar' ? 'c' : 'card';
  const ns = namespace === 'calendar' ? 'urn:ietf:params:xml:ns:caldav' : 'urn:ietf:params:xml:ns:carddav';
  const homeXml = parser.parse(await davFetch(principalUrl, {
    method: 'PROPFIND', headers: { Depth: '0' },
    body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:${prefix}="${ns}"><d:prop><${prefix}:${homeProp}/></d:prop></d:propfind>`
  }));
  const home = asArray(homeXml.multistatus?.response)[0];
  const homeUrl = absolute(principalUrl, hrefOf(propOf(home)[homeProp]));
  if (!homeUrl) throw new Error('Répertoire iCloud introuvable.');
  return homeUrl;
}

async function listCalendars() {
  const home = await discoverHome('https://caldav.icloud.com/', 'calendar-home-set', 'calendar');
  const xml = parser.parse(await davFetch(home, {
    method: 'PROPFIND', headers: { Depth: '1' },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>'
  }));
  return asArray(xml.multistatus?.response).map(r => {
    const prop = propOf(r), type = prop.resourcetype || {};
    return {
      url: absolute(home, hrefOf(r.href)),
      name: textValue(prop.displayname) || 'Calendrier iCloud',
      isCalendar: Object.prototype.hasOwnProperty.call(type, 'calendar')
    };
  }).filter(x => x.isCalendar && x.url);
}

async function fetchCalendarResources(calendar) {
  const body = '<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter></c:calendar-query>';
  const xml = parser.parse(await davFetch(calendar.url, { method: 'REPORT', headers: { Depth: '1' }, body }));
  const rows = [];
  for (const response of asArray(xml.multistatus?.response)) {
    const ical = textValue(propOf(response)['calendar-data']);
    if (!ical || !ical.includes('BEGIN:VEVENT')) continue;
    const href = hrefOf(response.href) || crypto.randomUUID();
    rows.push({
      id: stableId('ical', calendar.url + '|' + href),
      kind: 'ical',
      calendar_name: calendar.name,
      title: null,
      ical
    });
  }
  return rows;
}

async function listAddressBooks() {
  const home = await discoverHome('https://contacts.icloud.com/', 'addressbook-home-set', 'contacts');
  const xml = parser.parse(await davFetch(home, {
    method: 'PROPFIND', headers: { Depth: '1' },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>'
  }));
  return asArray(xml.multistatus?.response).map(r => {
    const prop = propOf(r), type = prop.resourcetype || {};
    return {
      url: absolute(home, hrefOf(r.href)),
      name: textValue(prop.displayname) || 'Contacts',
      isAddressBook: Object.prototype.hasOwnProperty.call(type, 'addressbook')
    };
  }).filter(x => x.isAddressBook && x.url);
}

function unfoldVcard(text) { return String(text || '').replace(/\r?\n[ \t]/g, ''); }
function unescapeVcard(value) { return String(value || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\'); }
function field(lines, name) {
  const upper = name.toUpperCase();
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const left = line.slice(0, colon).split(';')[0].toUpperCase();
    if (left === upper || left.endsWith('.' + upper)) return unescapeVcard(line.slice(colon + 1));
  }
  return null;
}
function parseBirthday(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  let m = value.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (m) { const y = Number(m[1]); return { year: y === 1604 ? null : y, month: Number(m[2]), day: Number(m[3]) }; }
  m = value.match(/^--?(\d{2})-?(\d{2})$/);
  if (m) return { year: null, month: Number(m[1]), day: Number(m[2]) };
  m = value.match(/^(\d{2})[\/-](\d{2})$/);
  if (m) return { year: null, month: Number(m[1]), day: Number(m[2]) };
  return null;
}

async function fetchBirthdays(book) {
  const body = '<?xml version="1.0"?><card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><card:address-data content-type="text/vcard" version="3.0"/></d:prop><card:filter><card:prop-filter name="FN"/></card:filter></card:addressbook-query>';
  const xml = parser.parse(await davFetch(book.url, { method: 'REPORT', headers: { Depth: '1' }, body }));
  const rows = [];
  for (const response of asArray(xml.multistatus?.response)) {
    const card = textValue(propOf(response)['address-data']);
    if (!card || !card.includes('BEGIN:VCARD')) continue;
    const lines = unfoldVcard(card).split(/\r?\n/);
    const birthday = parseBirthday(field(lines, 'BDAY'));
    if (!birthday) continue;
    const name = field(lines, 'FN') || 'Contact';
    const uid = field(lines, 'UID') || hrefOf(response.href) || name;
    rows.push({
      id: stableId('birthday', uid),
      kind: 'birthday',
      calendar_name: 'Anniversaires',
      title: name,
      ical: null,
      birthday_month: birthday.month,
      birthday_day: birthday.day,
      birthday_year: birthday.year
    });
  }
  return rows;
}

async function collectIcloudSnapshot() {
  const items = [];
  const calendars = [];
  const addressBooks = [];

  for (const calendar of await listCalendars()) {
    try {
      const rows = await fetchCalendarResources(calendar);
      items.push(...rows);
      calendars.push({ name: calendar.name, count: rows.length, error: null });
    } catch (error) {
      calendars.push({ name: calendar.name, count: 0, error: error.message });
    }
  }

  for (const book of await listAddressBooks()) {
    try {
      const rows = await fetchBirthdays(book);
      items.push(...rows);
      addressBooks.push({ name: book.name, birthdays: rows.length, error: null });
    } catch (error) {
      addressBooks.push({ name: book.name, birthdays: 0, error: error.message });
    }
  }

  return { items, calendars, addressBooks };
}

function supabaseHeaders() {
  const key = required('SUPABASE_SERVICE_ROLE_KEY');
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
}
function supabaseBase() { return required('SUPABASE_URL').replace(/\/$/, '') + '/rest/v1'; }

async function supabase(path, options = {}) {
  const response = await fetch(supabaseBase() + path, { ...options, headers: { ...supabaseHeaders(), ...(options.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

module.exports = { required, collectIcloudSnapshot, supabase };
