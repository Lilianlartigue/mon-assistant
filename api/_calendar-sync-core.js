const { XMLParser } = require('fast-xml-parser');
const crypto = require('crypto');
const parser = new XMLParser({ ignoreAttributes:false, removeNSPrefix:true });
function required(name){const v=process.env[name];if(!v)throw new Error(`Variable Vercel manquante : ${name}`);return v}
function asArray(v){return v==null?[]:(Array.isArray(v)?v:[v])}
function propOf(r){const p=asArray(r?.propstat);const ok=p.find(x=>String(x.status||'').includes('200'))||p[0]||{};return ok.prop||{}}
function textValue(v){if(typeof v==='string')return v;if(Array.isArray(v))return v.map(textValue).join('');if(v&&typeof v==='object'){if(typeof v['#text']==='string')return v['#text'];if(typeof v.__cdata==='string')return v.__cdata;if(typeof v['#cdata']==='string')return v['#cdata'];return Object.entries(v).filter(([k])=>!k.startsWith('@_')).map(([,x])=>textValue(x)).join('')}return ''}
function hrefOf(v){if(!v)return null;if(typeof v==='string')return v;return v.href||textValue(v)||null}
function absolute(base,href){return href?new URL(href,base).toString():null}
function stableId(prefix,value){return prefix+'-'+crypto.createHash('sha1').update(String(value)).digest('hex')}
function authHeader(){return 'Basic '+Buffer.from(required('ICLOUD_EMAIL')+':'+required('ICLOUD_APP_PASSWORD')).toString('base64')}
async function davFetch(url,options={}){const response=await fetch(url,{...options,headers:{Authorization:authHeader(),'Content-Type':'application/xml; charset=utf-8',...(options.headers||{})}});const text=await response.text();if(!response.ok&&response.status!==207)throw new Error(`DAV ${response.status} : ${text.slice(0,500)}`);return text}
async function discoverHome(root,homeProp,namespace){const p=parser.parse(await davFetch(root,{method:'PROPFIND',headers:{Depth:'0'},body:'<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>'}));const principal=asArray(p.multistatus?.response)[0];const principalUrl=absolute(root,hrefOf(propOf(principal)['current-user-principal']));if(!principalUrl)throw new Error('Principal iCloud introuvable.');const prefix=namespace==='calendar'?'c':'card';const ns=namespace==='calendar'?'urn:ietf:params:xml:ns:caldav':'urn:ietf:params:xml:ns:carddav';const h=parser.parse(await davFetch(principalUrl,{method:'PROPFIND',headers:{Depth:'0'},body:`<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:${prefix}="${ns}"><d:prop><${prefix}:${homeProp}/></d:prop></d:propfind>`}));const home=asArray(h.multistatus?.response)[0];const url=absolute(principalUrl,hrefOf(propOf(home)[homeProp]));if(!url)throw new Error('Répertoire iCloud introuvable.');return url}
async function listCalendars(){const home=await discoverHome('https://caldav.icloud.com/','calendar-home-set','calendar');const xml=parser.parse(await davFetch(home,{method:'PROPFIND',headers:{Depth:'1'},body:'<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>'}));return asArray(xml.multistatus?.response).map(r=>{const p=propOf(r),t=p.resourcetype||{};return{url:absolute(home,hrefOf(r.href)),name:textValue(p.displayname)||'Calendrier iCloud',isCalendar:Object.prototype.hasOwnProperty.call(t,'calendar')}}).filter(x=>x.isCalendar&&x.url)}
async function fetchCalendarResources(calendar){const body='<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter></c:calendar-query>';const xml=parser.parse(await davFetch(calendar.url,{method:'REPORT',headers:{Depth:'1'},body}));const rows=[];for(const r of asArray(xml.multistatus?.response)){const ical=textValue(propOf(r)['calendar-data']);if(!ical||!ical.includes('BEGIN:VEVENT'))continue;const href=hrefOf(r.href)||crypto.randomUUID();rows.push({id:stableId('ical',calendar.url+'|'+href),kind:'ical',calendar_name:calendar.name,title:null,ical})}return rows}
async function listAddressBooks(){const home=await discoverHome('https://contacts.icloud.com/','addressbook-home-set','contacts');const xml=parser.parse(await davFetch(home,{method:'PROPFIND',headers:{Depth:'1'},body:'<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>'}));return asArray(xml.multistatus?.response).map(r=>{const p=propOf(r),t=p.resourcetype||{};return{url:absolute(home,hrefOf(r.href)),name:textValue(p.displayname)||'Contacts',isAddressBook:Object.prototype.hasOwnProperty.call(t,'addressbook')}}).filter(x=>x.isAddressBook&&x.url)}
function unfoldVcard(text){return String(text||'').replace(/\r?\n[ \t]/g,'')}
function unescapeVcard(v){return String(v||'').replace(/\\n/gi,'\n').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\')}
function field(lines,name){const upper=name.toUpperCase();for(const line of lines){const colon=line.indexOf(':');if(colon<0)continue;const left=line.slice(0,colon).split(';')[0].toUpperCase();if(left===upper||left.endsWith('.'+upper))return unescapeVcard(line.slice(colon+1))}return null}
function parseBirthday(raw){if(!raw)return null;const value=String(raw).trim();let m=value.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);if(m){const y=Number(m[1]);return{year:y===1604?null:y,month:Number(m[2]),day:Number(m[3])}}m=value.match(/^--?(\d{2})-?(\d{2})$/);if(m)return{year:null,month:Number(m[1]),day:Number(m[2])};m=value.match(/^(\d{2})[\/-](\d{2})$/);if(m)return{year:null,month:Number(m[1]),day:Number(m[2])};m=value.match(/^(\d{2})(\d{2})$/);if(m)return{year:null,month:Number(m[1]),day:Number(m[2])};return null}
async function fetchBirthdays(book){
  const bodies=[
    '<?xml version="1.0"?><card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><card:address-data/></d:prop><card:filter test="anyof"><card:prop-filter name="FN"/></card:filter></card:addressbook-query>',
    '<?xml version="1.0"?><card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><card:address-data/></d:prop><card:filter test="anyof"><card:prop-filter name="BDAY"/></card:filter></card:addressbook-query>'
  ];
  let responses=[];let lastError=null;
  for(const body of bodies){try{const xml=parser.parse(await davFetch(book.url,{method:'REPORT',headers:{Depth:'1'},body}));responses=asArray(xml.multistatus?.response);if(responses.length)break}catch(e){lastError=e}}
  if(!responses.length&&lastError)throw lastError;
  const rows=[];
  for(const r of responses){const card=textValue(propOf(r)['address-data']);if(!card||!card.includes('BEGIN:VCARD'))continue;const lines=unfoldVcard(card).split(/\r?\n/);const rawBirthday=field(lines,'BDAY');const birthday=parseBirthday(rawBirthday);if(!birthday)continue;const omitYear=field(lines,'X-APPLE-OMIT-YEAR');if(String(omitYear||'').trim()==='1604')birthday.year=null;const name=field(lines,'FN')||field(lines,'N')||'Contact';const uid=field(lines,'UID')||hrefOf(r.href)||name;rows.push({id:stableId('birthday',uid),kind:'birthday',calendar_name:'Anniversaires',title:name,ical:null,birthday_month:birthday.month,birthday_day:birthday.day,birthday_year:birthday.year})}
  return rows
}
async function collectIcloudSnapshot(){const items=[];const calendars=[];const addressBooks=[];const [calResult,bookResult]=await Promise.allSettled([listCalendars(),listAddressBooks()]);const cals=calResult.status==='fulfilled'?calResult.value:[];const books=bookResult.status==='fulfilled'?bookResult.value:[];const calRows=await Promise.all(cals.map(async c=>{try{const rows=await fetchCalendarResources(c);calendars.push({name:c.name,count:rows.length,error:null});return rows}catch(e){calendars.push({name:c.name,count:0,error:e.message});return[]}}));const birthRows=await Promise.all(books.map(async b=>{try{const rows=await fetchBirthdays(b);addressBooks.push({name:b.name,birthdays:rows.length,error:null});return rows}catch(e){addressBooks.push({name:b.name,birthdays:0,error:e.message});return[]}}));for(const rows of [...calRows,...birthRows])items.push(...rows);if(calResult.status==='rejected')calendars.push({name:'iCloud',count:0,error:calResult.reason?.message||'Erreur'});if(bookResult.status==='rejected')addressBooks.push({name:'iCloud',birthdays:0,error:bookResult.reason?.message||'Erreur'});return{items,calendars,addressBooks}}
function supabaseHeaders(){
  const key=required('SUPABASE_SERVICE_ROLE_KEY');
  const headers={
    apikey:key,
    'Content-Type':'application/json',
    Prefer:'return=minimal'
  };

  // Legacy service_role keys are JWTs and can be sent as Bearer tokens.
  // New sb_secret_ keys are API keys, not JWTs: sending them in
  // Authorization causes Supabase to reject the request with HTTP 401.
  if(!String(key).startsWith('sb_secret_')){
    headers.Authorization='Bearer '+key;
  }

  return headers;
}
function supabaseBase(){return required('SUPABASE_URL').replace(/\/$/,'')+'/rest/v1'}
async function supabase(path,options={}){const response=await fetch(supabaseBase()+path,{...options,headers:{...supabaseHeaders(),...(options.headers||{})}});const text=await response.text();if(!response.ok)throw new Error(`Supabase ${response.status}: ${text.slice(0,500)}`);return text?JSON.parse(text):null}
module.exports={required,collectIcloudSnapshot,supabase};
