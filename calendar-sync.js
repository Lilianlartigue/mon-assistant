(function () {
  const STORAGE_KEY = 'mon-assistant-data-v2';
  const LAST_SYNC_KEY = 'mon-assistant-icloud-last-sync';
  const DIAG_KEY = 'mon-assistant-icloud-diagnostics';
  const SYNC_INTERVAL_MS = 5 * 60 * 1000;

  function currentRange() {
    const now = new Date();
    const start = new Date(now.getFullYear() - 5, 0, 1);
    const end = new Date(now.getFullYear() + 4, 0, 1);
    return { start, end };
  }

  function shouldSync(force) {
    if (force) return true;
    const last = Number(localStorage.getItem(LAST_SYNC_KEY) || 0);
    return !last || Date.now() - last > SYNC_INTERVAL_MS;
  }

  function uniqueEvents(events) {
    const map = new Map();
    for (const event of events || []) {
      if (!event || !event.start) continue;
      const key = event.id || [event.uid, event.start, event.title].join('|');
      map.set(key, event);
    }
    return Array.from(map.values()).sort((a, b) => String(a.start).localeCompare(String(b.start)));
  }

  function mergeIcloudEvents(events) {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (_) {
      saved = {};
    }

    const existing = Array.isArray(saved.events) ? saved.events : [];
    const localEvents = existing.filter(event => event.source !== 'icloud');
    saved.events = localEvents.concat(uniqueEvents(events));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Erreur ${response.status}`);
    return payload;
  }

  async function syncIcloudCalendar(force) {
    if (!shouldSync(force)) return { skipped: true };

    const range = currentRange();
    const calendarParams = new URLSearchParams({
      start: range.start.toISOString(),
      end: range.end.toISOString()
    });
    const birthdayParams = new URLSearchParams({
      startYear: String(range.start.getFullYear()),
      endYear: String(range.end.getFullYear())
    });

    const [calendarResult, birthdayResult] = await Promise.allSettled([
      fetchJson('/api/icloud-calendar?' + calendarParams.toString()),
      fetchJson('/api/icloud-birthdays?' + birthdayParams.toString())
    ]);

    if (calendarResult.status === 'rejected' && birthdayResult.status === 'rejected') {
      throw new Error(`Calendrier: ${calendarResult.reason.message} | Contacts: ${birthdayResult.reason.message}`);
    }

    const calendarPayload = calendarResult.status === 'fulfilled' ? calendarResult.value : { events: [], calendars: [], error: calendarResult.reason.message };
    const birthdayPayload = birthdayResult.status === 'fulfilled' ? birthdayResult.value : { events: [], addressBooks: [], error: birthdayResult.reason.message };
    const events = uniqueEvents([...(calendarPayload.events || []), ...(birthdayPayload.events || [])]);

    mergeIcloudEvents(events);
    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));

    const diagnostics = {
      at: new Date().toISOString(),
      total: events.length,
      calendarCount: (calendarPayload.events || []).length,
      birthdayCount: (birthdayPayload.events || []).length,
      calendars: calendarPayload.calendars || [],
      addressBooks: birthdayPayload.addressBooks || [],
      calendarError: calendarPayload.error || null,
      contactsError: birthdayPayload.error || null
    };
    localStorage.setItem(DIAG_KEY, JSON.stringify(diagnostics));
    window.__icloudSyncDiagnostics = diagnostics;

    const payload = { ok: true, count: events.length, events, diagnostics };
    window.dispatchEvent(new CustomEvent('icloud-calendar-synced', { detail: payload }));
    return payload;
  }

  function diagnosticsText() {
    try {
      const d = JSON.parse(localStorage.getItem(DIAG_KEY) || 'null');
      if (!d) return '';
      const calendarNames = (d.calendars || []).map(c => `${c.name}: ${c.count || 0}${c.error ? ' ⚠' : ''}`).join(' · ');
      const books = (d.addressBooks || []).map(b => `${b.name}: ${b.birthdays || 0} anniversaires${b.error ? ' ⚠' : ''}`).join(' · ');
      return `iCloud: ${d.total || 0} événements (${d.calendarCount || 0} calendriers + ${d.birthdayCount || 0} anniversaires). ${calendarNames}${calendarNames && books ? ' · ' : ''}${books}`;
    } catch (_) {
      return '';
    }
  }

  function addDiagnostics() {
    if (!location.hash.startsWith('#/calendar')) return;
    const heading = document.querySelector('.page-heading');
    if (!heading) return;
    let details = document.getElementById('icloud-sync-details');
    if (!details) {
      details = document.createElement('p');
      details.id = 'icloud-sync-details';
      details.style.marginTop = '10px';
      details.style.fontSize = '0.85rem';
      details.style.opacity = '0.75';
      heading.insertAdjacentElement('afterend', details);
    }
    details.textContent = diagnosticsText();
  }

  function addSyncButton() {
    if (!location.hash.startsWith('#/calendar')) return;
    const heading = document.querySelector('.page-heading');
    if (!heading) return;
    if (!document.getElementById('icloud-sync-button')) {
      const button = document.createElement('button');
      button.id = 'icloud-sync-button';
      button.className = 'secondary-button';
      button.type = 'button';
      button.textContent = 'Synchroniser iCloud';
      button.addEventListener('click', async () => {
        const old = button.textContent;
        button.disabled = true;
        button.textContent = 'Synchronisation…';
        try {
          const result = await syncIcloudCalendar(true);
          button.textContent = `${result.count || 0} événement(s) synchronisé(s)`;
          addDiagnostics();
          if (typeof showToast === 'function') showToast('Synchronisation iCloud terminée');
          setTimeout(() => location.reload(), 1600);
        } catch (error) {
          button.textContent = 'Erreur iCloud';
          console.error(error);
          if (typeof showToast === 'function') showToast(error.message);
          setTimeout(() => {
            button.textContent = old;
            button.disabled = false;
          }, 3000);
        }
      });
      heading.appendChild(button);
    }
    addDiagnostics();
  }

  window.addEventListener('hashchange', () => setTimeout(addSyncButton, 0));
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(addSyncButton, 0);
    syncIcloudCalendar(false)
      .then(result => {
        if (result && !result.skipped && Array.isArray(result.events)) location.reload();
      })
      .catch(error => console.warn('iCloud:', error.message));
  });
})();
