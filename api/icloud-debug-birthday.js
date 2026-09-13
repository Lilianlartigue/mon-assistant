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
  if (!response.ok && response.status !== 207) throw new Error(`CardDAV ${response.status}: ${text.slice(0, 300)}`);
  return text;
}

function asArray(value) { return value == null ? [] : (Array.isArray(value) ? value : [value]); }
function propOf(response) {
  const list = asArray(response?.propstat);
  return (list.find(x => String(x.status || '').includes('200')) || list[0] || {}).prop || {};
}
function textValue(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value['#text'] || value.__cdata || value['#cdata'] || '';
  return '';
}
function hrefOf(value) { return !value ? null : (typeof value === 'string' ? value : value.href || textValue(value) || null); }
function absolute(base, href) { return href ? new URL(href, base).toString() : null; }

async function discoverHome() {
  const root = 'https://contacts.icloud.com/';
  const pxml = parser.parse(await davFetch(root, {
    method: 'PROPFIND', headers: { Depth: '0' },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>'
  }));
  const principal = absolute(root, hrefOf(propOf(asArray(pxml.multistatus?.response)[0])['current-user-principal']));
  if (!principal) throw new Error('Principal CardDAV introuvable');

  const hxml = parser.parse(await davFetch(principal, {
    method: 'PROPFIND', headers: { Depth: '0' },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><card:addressbook-home-set/></d:prop></d:propfind>'
  }));
  const home = absolute(principal, hrefOf(propOf(asArray(hxml.multistatus?.response)[0])['addressbook-home-set']));
  if (!home) throw new Error('Répertoire Contacts introuvable');
  return home;
}

async function listBooks(home) {
  const xml = parser.parse(await davFetch(home, {
    method: 'PROPFIND', headers: { Depth: '1' },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>'
  }));
  return asArray(xml.multistatus?.response).map(r => {
    const p = propOf(r), t = p.resourcetype || {};
    return { name: textValue(p.displayname) || 'Contacts', url: absolute(home, r.href), ok: Object.prototype.hasOwnProperty.call(t, 'addressbook') };
  }).filter(x => x.ok && x.url);
}

async function fetchCards(book) {
  const body = '<?xml version="1.0"?><card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><card:address-data/></d:prop><card:filter><card:prop-filter name="FN"/></card:filter></card:addressbook-query>';
  const xml = parser.parse(await davFetch(book.url, { method: 'REPORT', headers: { Depth: '1' }, body }));
  const out = [];
  for (const r of asArray(xml.multistatus?.response)) {
    const v = textValue(propOf(r)['address-data']);
    if (v && v.includes('BEGIN:VCARD')) out.push(v);
  }
  return out;
}

function unfold(v) { return String(v || '').replace(/\r?\n[ \t]/g, ''); }
function safeDiagnostic(card) {
  const lines = unfold(card).split(/\r?\n/);
  const fn = lines.find(x => /^FN[;:]/i.test(x)) || '';
  const name = fn.includes(':') ? fn.slice(fn.indexOf(':') + 1) : '';
  const dateLines = lines.filter(x => /^BDAY[;:]/i.test(x) || /^X-APPLE-OMIT-YEAR[;:]/i.test(x));
  return { name, dateLines };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });
  try {
    const wanted = String(req.query.name || '').trim().toLocaleLowerCase('fr');
    if (!wanted) return res.status(400).json({ error: 'Paramètre name requis' });
    const books = await listBooks(await discoverHome());
    const matches = [];
    let scanned = 0;
    for (const book of books) {
      const cards = await fetchCards(book);
      scanned += cards.length;
      for (const card of cards) {
        const diag = safeDiagnostic(card);
        if (diag.name.toLocaleLowerCase('fr').includes(wanted)) matches.push({ addressBook: book.name, ...diag });
      }
    }
    return res.status(200).json({ ok: true, scanned, matches });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erreur diagnostic iCloud' });
  }
};
