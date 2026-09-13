(function () {
  const STORAGE_KEY = 'mon-assistant-data-v2';
  const LAST_SYNC_KEY = 'mon-assistant-icloud-last-sync';
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

  function mergeIcloudEvents(events) {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (_) {
      saved = {};
    }

    const existing = Array.isArray(saved.events) ? saved.events : [];
    const localEvents = existing.filter(event => event.source !== 'icloud');
    saved.events = localEvents.concat(events || []);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }

  async function syncIcloudCalendar(force) {
    if (!shouldSync(force)) return { skipped: true };
    const range = currentRange();
    const params = new URLSearchParams({
      start: range.start.toISOString(),
      end: range.end.toISOString()
    });

    const response = await fetch('/api/icloud-calendar?' + params.toString(), { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Synchronisation iCloud impossible');

    mergeIcloudEvents(payload.events || []);
    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    window.dispatchEvent(new CustomEvent('icloud-calendar-synced', { detail: payload }));
    return payload;
  }

  function addSyncButton() {
    if (!location.hash.startsWith('#/calendar')) return;
    if (document.getElementById('icloud-sync-button')) return;
    const heading = document.querySelector('.page-heading');
    if (!heading) return;
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
        const failed = Array.isArray(result.calendars) ? result.calendars.filter(item => item.error) : [];
        button.textContent = `${result.count || 0} événement(s) synchronisé(s)`;
        if (failed.length && typeof showToast === 'function') {
          showToast(`${failed.length} calendrier(s) iCloud en erreur`);
        }
        setTimeout(() => location.reload(), 900);
      } catch (error) {
        button.textContent = 'Erreur iCloud';
        console.error(error);
        if (typeof showToast === 'function') showToast(error.message);
        setTimeout(() => {
          button.textContent = old;
          button.disabled = false;
        }, 2500);
      }
    });
    heading.appendChild(button);
  }

  window.addEventListener('hashchange', () => setTimeout(addSyncButton, 0));
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(addSyncButton, 0);
    syncIcloudCalendar(false)
      .then(result => {
        if (result && !result.skipped && Array.isArray(result.events)) location.reload();
      })
      .catch(error => console.warn('iCloud Calendar:', error.message));
  });
})();
