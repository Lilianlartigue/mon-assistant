(function () {
  const STORAGE_KEY = 'mon-assistant-data-v2';
  const DIAG_KEY = 'mon-assistant-icloud-diagnostics';
  const MIN_YEAR = 2000;
  const MAX_YEAR = 2100;
  let loading = false;
  let loadedKey = '';

  function readSaved() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch (_) { return {}; }
  }

  function visibleCenterDate() {
    try {
      if (typeof ui !== 'undefined' && ui.calendarDate instanceof Date) return new Date(ui.calendarDate);
    } catch (_) {}
    return new Date();
  }

  function windowFor(date) {
    const year = Math.max(MIN_YEAR, Math.min(MAX_YEAR, date.getFullYear()));
    const startYear = Math.max(MIN_YEAR, year - 2);
    const endYear = Math.min(MAX_YEAR + 1, year + 3);
    return {
      start: new Date(Date.UTC(startYear, 0, 1)),
      end: new Date(Date.UTC(endYear, 0, 1)),
      key: startYear + '-' + endYear
    };
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

  function mergeRange(events, start, end) {
    const saved = readSaved();
    const existing = Array.isArray(saved.events) ? saved.events : [];
    const startMs = start.getTime();
    const endMs = end.getTime();
    const keep = existing.filter(event => {
      if (event.source !== 'icloud') return true;
      const time = new Date(event.start).getTime();
      return Number.isNaN(time) || time < startMs || time >= endMs;
    });
    saved.events = uniqueEvents(keep.concat(events || []));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    try { data.events = saved.events; } catch (_) {}
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, { cache: 'no-store', ...(options || {}) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Erreur ${response.status}`);
    return payload;
  }

  function saveDiagnostics(payload) {
    const state = payload?.state || {};
    const diag = {
      at: state.synced_at || null,
      total: payload?.count || 0,
      itemCount: state.item_count || 0,
      calendarCount: state.calendar_count || 0,
      birthdayCount: state.birthday_count || 0,
      status: state.status || 'inconnu'
    };
    localStorage.setItem(DIAG_KEY, JSON.stringify(diag));
    window.__icloudSyncDiagnostics = diag;
  }

  async function loadVisibleRange(force) {
    if (loading) return;
    const range = windowFor(visibleCenterDate());
    if (!force && loadedKey === range.key) return;
    loading = true;
    try {
      const params = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString() });
      const payload = await fetchJson('/api/calendar-feed?' + params.toString());
      mergeRange(payload.events || [], range.start, range.end);
      saveDiagnostics(payload);
      loadedKey = range.key;
      if (typeof render === 'function') render();
      addControls();
    } finally {
      loading = false;
    }
  }

  async function manualSync(button) {
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Synchronisation…';
    try {
      const result = await fetchJson('/api/calendar-daily-sync?manual=1', { method: 'POST' });
      loadedKey = '';
      await loadVisibleRange(true);
      button.textContent = 'Synchronisé';
      if (typeof showToast === 'function') showToast(`${result.itemCount || 0} éléments iCloud mis à jour.`);
      setTimeout(() => { button.textContent = old; button.disabled = false; }, 1800);
    } catch (error) {
      button.textContent = 'Erreur de synchronisation';
      if (typeof showToast === 'function') showToast(error.message);
      setTimeout(() => { button.textContent = old; button.disabled = false; }, 3000);
    }
  }

  function diagnosticsText() {
    try {
      const d = JSON.parse(localStorage.getItem(DIAG_KEY) || 'null');
      if (!d) return 'Synchronisation serveur non initialisée.';
      const date = d.at ? new Date(d.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais';
      return `iCloud synchronisé : ${date} · ${d.itemCount || 0} sources · ${d.birthdayCount || 0} anniversaires · calendrier consultable de 2000 à 2100.`;
    } catch (_) { return ''; }
  }

  function addControls() {
    if (!location.hash.startsWith('#/calendar')) return;
    const heading = document.querySelector('.page-heading');
    if (!heading) return;

    let button = document.getElementById('icloud-sync-button');
    if (!button) {
      button = document.createElement('button');
      button.id = 'icloud-sync-button';
      button.className = 'secondary-button';
      button.type = 'button';
      button.textContent = 'Synchroniser maintenant';
      button.addEventListener('click', () => manualSync(button));
      heading.appendChild(button);
    }

    let details = document.getElementById('icloud-sync-details');
    if (!details) {
      details = document.createElement('p');
      details.id = 'icloud-sync-details';
      details.style.margin = '-16px 0 22px';
      details.style.fontSize = '.86rem';
      details.style.color = 'var(--muted)';
      heading.insertAdjacentElement('afterend', details);
    }
    details.textContent = diagnosticsText();
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (['calendar-prev', 'calendar-next', 'calendar-today'].includes(button.dataset.action)) {
      setTimeout(() => loadVisibleRange(false).catch(error => console.warn('Calendrier:', error.message)), 0);
    }
  });

  window.addEventListener('hashchange', () => {
    setTimeout(() => {
      addControls();
      if (location.hash.startsWith('#/calendar')) loadVisibleRange(false).catch(error => console.warn('Calendrier:', error.message));
    }, 0);
  });

  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(addControls, 0);
    loadVisibleRange(false).catch(error => console.warn('Calendrier:', error.message));
  });
})();
