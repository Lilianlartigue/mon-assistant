const ical = require('node-ical');
const { supabase } = require('./_calendar-sync-core');

function asDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function eventId(uid, start) {
  return `icloud-${Buffer.from(String(uid || '') + '|' + new Date(start).toISOString()).toString('base64url').slice(0, 100)}`;
}
function isAllDay(event) { return event.datetype === 'date' || event.start?.dateOnly === true; }
function normalize(event, calendarName, occurrenceStart, occurrenceEnd) {
  const start = asDate(occurrenceStart || event.start);
  if (!start) return null;
  const originalStart = asDate(event.start) || start;
  const originalEnd = asDate(event.end);
  let duration = originalEnd ? originalEnd - originalStart : 60 * 60 * 1000;
  if (isAllDay(event) && (!duration || duration < 86400000)) duration = 86400000;
  const end = asDate(occurrenceEnd) || new Date(start.getTime() + duration);
  return {
    id: eventId(event.uid || event.summary, start),
    title: String(event.summary || 'Événement iCloud'),
    start: start.toISOString(),
    end: end.toISOString(),
    category: calendarName === 'Travail' ? 'Travail' : 'Personnel',
    allDay: isAllDay(event),
    source: 'icloud',
    calendar: calendarName || 'iCloud',
    uid: event.uid || null,
    recurring: Boolean(event.rrule)
  };
}

function expandIcs(raw, calendarName, rangeStart, rangeEnd) {
  const parsed = ical.sync.parseICS(String(raw || ''));
  const output = [];
  for (const event of Object.values(parsed)) {
    if (!event || event.type !== 'VEVENT' || !event.start) continue;

    if (event.rrule && typeof event.rrule.between === 'function') {
      let occurrences = [];
      try { occurrences = event.rrule.between(rangeStart, rangeEnd, true) || []; } catch (_) { continue; }
      const excluded = new Set(Object.values(event.exdate || {}).map(v => new Date(v).getTime()));
      const overrides = Object.values(event.recurrences || {});
      for (const occurrence of occurrences) {
        const date = new Date(occurrence);
        if (excluded.has(date.getTime())) continue;
        const override = overrides.find(candidate => candidate?.recurrenceid && new Date(candidate.recurrenceid).getTime() === date.getTime());
        const normalized = override ? normalize(override, calendarName, override.start, override.end) : normalize(event, calendarName, date);
        if (normalized) output.push(normalized);
      }
      continue;
    }

    const normalized = normalize(event, calendarName);
    if (!normalized) continue;
    if (new Date(normalized.end) >= rangeStart && new Date(normalized.start) <= rangeEnd) output.push(normalized);
  }
  return output;
}

function birthdayEvents(row, start, end) {
  const output = [];
  const startYear = Math.max(2000, start.getUTCFullYear() - 1);
  const endYear = Math.min(2100, end.getUTCFullYear() + 1);
  for (let year = startYear; year <= endYear; year++) {
    const date = new Date(Date.UTC(year, Number(row.birthday_month) - 1, Number(row.birthday_day)));
    if (date.getUTCMonth() !== Number(row.birthday_month) - 1 || date.getUTCDate() !== Number(row.birthday_day)) continue;
    if (date < start || date > end) continue;
    const next = new Date(date.getTime() + 86400000);
    output.push({
      id: `icloud-bday-${row.id}-${year}`,
      title: `Anniversaire de ${row.title || 'Contact'}`,
      start: date.toISOString(),
      end: next.toISOString(),
      category: 'Personnel',
      allDay: true,
      source: 'icloud',
      calendar: 'Anniversaires',
      recurring: true,
      birthday: true,
      age: row.birthday_year && year >= row.birthday_year ? year - row.birthday_year : null
    });
  }
  return output;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });
  try {
    const now = new Date();
    const start = asDate(req.query.start) || new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
    const end = asDate(req.query.end) || new Date(Date.UTC(now.getUTCFullYear() + 2, 0, 1));
    if (start > end) return res.status(400).json({ error: 'Plage de dates invalide' });
    if (start.getUTCFullYear() < 2000 || end.getUTCFullYear() > 2101) return res.status(400).json({ error: 'Le calendrier est limité à 2000-2100.' });
    if (end - start > 1000 * 60 * 60 * 24 * 366 * 6) return res.status(400).json({ error: 'Charge une plage de 6 ans maximum à la fois.' });

    const rows = await supabase('/calendar_sync_items?source=eq.icloud&select=*', { method: 'GET' }) || [];
    const stateRows = await supabase('/calendar_sync_state?id=eq.icloud&select=*', { method: 'GET' }) || [];
    const events = [];
    for (const row of rows) {
      if (row.kind === 'ical' && row.ical) events.push(...expandIcs(row.ical, row.calendar_name, start, end));
      if (row.kind === 'birthday') events.push(...birthdayEvents(row, start, end));
    }

    const unique = new Map();
    for (const event of events) unique.set(event.id || `${event.title}|${event.start}`, event);
    const sorted = Array.from(unique.values()).sort((a, b) => String(a.start).localeCompare(String(b.start)));

    return res.status(200).json({ ok: true, count: sorted.length, events: sorted, state: stateRows[0] || null });
  } catch (error) {
    console.error('Calendar feed:', error);
    return res.status(500).json({ error: error.message || 'Erreur du calendrier synchronisé' });
  }
};
