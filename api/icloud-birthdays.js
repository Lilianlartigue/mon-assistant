const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
function required(name) { const value = process.env[name]; if (!value) throw new Error(`Variable Vercel manquante : ${name}`); return value; }
function authHeader() { return 'Basic ' + Buffer.from(required('ICLOUD_EMAIL') + ':' + required('ICLOUD_APP_PASSWORD')).toString('base64'); }
async function davFetch(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: authHeader(), 'Content-Type': 'application/xml; charset=utf-8', ...(options.headers || {}) } });
  const text = await response.text();
  if (!response.ok && response.status !== 207) throw new Error(`CardDAV ${response.status} : ${text.slice(0, 500)}`);
  return text;
}
function asArray(value) { return value == null ? [] : (Array.isArray(value) ? value : [value]); }
function propOf(response) { const p = asArray(response?.propstat); return (p.find(x => String(x.status || '').includes('200')) || p[0] || {}).prop || {}; }
function textValue(value) { if (typeof value === 'string') return value; if (value && typeof value === 'object') return value['#text'] || value.__cdata || value['#cdata'] || ''; return ''; }
function hrefOf(value) { if (!value) return null; return typeof value === 'string' ? value : value.href || textValue(value) || null; }
function absolute(base, href) { return href ? new URL(href, base).toString() : null; }

async function discoverAddressBookHome() {
  const root = 'https://contacts.icloud.com/';
  const principalXml = parser.parse(await davFetch(root, { method: 'PROPFIND', headers: { Depth: '0' }, body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>' }));
  const principalUrl = absolute(root, hrefOf(propOf(asArray(principalXml.multistatus?.response)[0])['current-user-principal']));
  if (!principalUrl) throw new Error('Principal CardDAV iCloud introuvable.');
  const homeXml = parser.parse(await davFetch(principalUrl, { method: 'PROPFIND', headers: { Depth: '0' }, body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><card:addressbook-home-set/></d:prop></d:propfind>' }));
  const homeUrl = absolute(principalUrl, hrefOf(propOf(asArray(homeXml.multistatus?.response)[0])['addressbook-home-set']));
  if (!homeUrl) throw new Error('Répertoire Contacts iCloud introuvable.');
  return homeUrl;
}
async function listAddressBooks(homeUrl) {
  const xml = parser.parse(await davFetch(homeUrl, { method: 'PROPFIND', headers: { Depth: '1' }, body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>' }));
  return asArray(xml.multistatus?.response).map(response => { const prop = propOf(response), type = prop.resourcetype || {}; return { name: textValue(prop.displayname) || prop.displayname || 'Contacts', url: absolute(homeUrl, response.href), isAddressBook: Object.prototype.hasOwnProperty.call(type, 'addressbook') }; }).filter(x => x.isAddressBook && x.url);
}
async function fetchVCards(book) {
  const body = '<?xml version="1.0"?><card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><card:address-data content-type="text/vcard" version="3.0"/></d:prop><card:filter><card:prop-filter name="FN"/></card:filter></card:addressbook-query>';
  const xml = parser.parse(await davFetch(book.url, { method: 'REPORT', headers: { Depth: '1' }, body }));
  const cards = [];
  for (const response of asArray(xml.multistatus?.response)) { const data = textValue(propOf(response)['address-data']); if (data && data.includes('BEGIN:VCARD')) cards.push(data); }
  return cards;
}
function unfoldVcard(text) { return String(text || '').replace(/\r?\n[ \t]/g, ''); }
function unescapeVcard(value) { return String(value || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\'); }
function field(lines, name) {
  const upper = name.toUpperCase();
  for (const line of lines) { const colon = line.indexOf(':'); if (colon < 0) continue; const left = line.slice(0, colon).split(';')[0].toUpperCase(); if (left === upper || left.endsWith('.' + upper)) return unescapeVcard(line.slice(colon + 1)); }
  return null;
}
function parseBirthday(raw) {
  if (!raw) return null;
  let value = String(raw).trim();
  // Apple may encode dates without a year as --MM-DD, MM-DD, 1604-MM-DD or an x-apple omitted-year form.
  let m = value.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (m) { const y = Number(m[1]); return { year: y === 1604 ? null : y, month: Number(m[2]), day: Number(m[3]) }; }
  m = value.match(/^--?(\d{2})-?(\d{2})$/);
  if (m) return { year: null, month: Number(m[1]), day: Number(m[2]) };
  m = value.match(/^(\d{2})[\/-](\d{2})$/);
  if (m) return { year: null, month: Number(m[1]), day: Number(m[2]) };
  return null;
}
function birthdayFromLines(lines) {
  const direct = field(lines, 'BDAY');
  const parsed = parseBirthday(direct);
  if (parsed) return parsed;
  // Apple Contacts can store an omitted year in a companion X-APPLE-OMIT-YEAR property.
  for (const line of lines) {
    if (!/^BDAY[;:]/i.test(line)) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const p = parseBirthday(unescapeVcard(line.slice(colon + 1)));
    if (p) return p;
  }
  return null;
}
function validDate(year, month, day) { const d = new Date(Date.UTC(year, month - 1, day)); return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day; }
function birthdayEvents(card, startYear, endYear, bookName) {
  const lines = unfoldVcard(card).split(/\r?\n/), name = field(lines, 'FN') || 'Contact', uid = field(lines, 'UID') || name, birthday = birthdayFromLines(lines);
  if (!birthday) return [];
  const events = [];
  for (let year = startYear; year <= endYear; year++) {
    if (!validDate(year, birthday.month, birthday.day)) continue;
    const mm = String(birthday.month).padStart(2, '0'), dd = String(birthday.day).padStart(2, '0'), start = `${year}-${mm}-${dd}T00:00:00`;
    const next = new Date(Date.UTC(year, birthday.month - 1, birthday.day + 1));
    const end = `${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}-${String(next.getUTCDate()).padStart(2,'0')}T00:00:00`;
    events.push({ id: `icloud-bday-${Buffer.from(uid+'|'+year).toString('base64url').slice(0,100)}`, title: `Anniversaire de ${name}`, start, end, category: 'Personnel', allDay: true, source: 'icloud', calendar: 'Anniversaires', uid, recurring: true, birthday: true, age: birthday.year && year >= birthday.year ? year - birthday.year : null, addressBook: bookName });
  }
  return events;
}
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });
  try {
    const now = new Date(), startYear = Number(req.query.startYear || now.getFullYear()-1), endYear = Number(req.query.endYear || now.getFullYear()+3), books = await listAddressBooks(await discoverAddressBookHome()), details = [], events = [];
    for (const book of books) {
      try { const cards = await fetchVCards(book); let count = 0; for (const card of cards) { const generated = birthdayEvents(card,startYear,endYear,book.name); count += generated.length; events.push(...generated); } details.push({ name: book.name, contacts: cards.length, birthdays: count, error: null }); }
      catch (error) { details.push({ name: book.name, contacts: 0, birthdays: 0, error: error.message }); }
    }
    return res.status(200).json({ ok: true, count: events.length, addressBooks: details, events });
  } catch (error) { console.error(error); return res.status(500).json({ error: error.message || 'Erreur Contacts iCloud' }); }
};
