(function () {
  const STORAGE_KEY = 'mon-assistant-data-v2';

  function readSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return saved.settings || {};
    } catch (_) {
      return {};
    }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
  }

  async function registration() {
    if (!('serviceWorker' in navigator)) throw new Error('Service worker indisponible.');
    const existing = await navigator.serviceWorker.getRegistration();
    return existing || navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  }

  async function sendSubscription(subscription) {
    const settings = readSettings();
    const response = await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
        quietStart: settings.quietStart || '22:00',
        quietEnd: settings.quietEnd || '08:00'
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Impossible d’enregistrer les notifications.');
  }

  async function currentSubscription() {
    const reg = await registration();
    return reg.pushManager.getSubscription();
  }

  async function enablePushNotifications() {
    if (!('Notification' in window) || !('PushManager' in window)) {
      throw new Error('Les notifications push ne sont pas prises en charge sur cet appareil.');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Autorisation de notification refusée.');

    const reg = await registration();
    let subscription = await reg.pushManager.getSubscription();

    if (!subscription) {
      const keyResponse = await fetch('/api/push-public-key', { cache: 'no-store' });
      const keyPayload = await keyResponse.json().catch(() => ({}));
      if (!keyResponse.ok || !keyPayload.publicKey) throw new Error(keyPayload.error || 'Clé de notification indisponible.');

      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyPayload.publicKey)
      });
    }

    await sendSubscription(subscription);
    updateSettingsUi();
    if (typeof showToast === 'function') showToast('Notifications activées sur cet appareil.');
    return subscription;
  }

  async function syncPushPreferences() {
    try {
      const subscription = await currentSubscription();
      if (subscription && Notification.permission === 'granted') await sendSubscription(subscription);
      updateSettingsUi();
    } catch (_) {}
  }

  async function disablePushNotifications() {
    const subscription = await currentSubscription();
    if (subscription) {
      await fetch('/api/push-subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() })
      }).catch(() => {});
      await subscription.unsubscribe().catch(() => {});
    }
    updateSettingsUi();
    if (typeof showToast === 'function') showToast('Notifications désactivées sur cet appareil.');
  }

  async function updateSettingsUi() {
    if (!location.hash.startsWith('#/settings')) return;
    const button = document.querySelector('[data-action="request-notifications"]');
    if (!button) return;

    try {
      const subscription = await currentSubscription();
      const active = Notification.permission === 'granted' && !!subscription;
      button.textContent = active ? 'Désactiver' : 'Activer';
      button.dataset.pushActive = active ? '1' : '0';

      const row = button.closest('.settings-row');
      const state = row?.querySelector('.item-main p');
      if (state) state.textContent = active
        ? 'État actuel : notifications actives sur cet appareil'
        : 'État actuel : ' + (Notification.permission || 'non autorisées');
    } catch (_) {}
  }

  document.addEventListener('click', function (event) {
    const button = event.target.closest('[data-action="request-notifications"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const action = button.dataset.pushActive === '1' ? disablePushNotifications : enablePushNotifications;
    button.disabled = true;
    Promise.resolve(action())
      .catch(error => {
        if (typeof showToast === 'function') showToast(error.message || 'Erreur notifications.');
      })
      .finally(() => {
        button.disabled = false;
        updateSettingsUi();
      });
  }, true);

  document.addEventListener('submit', function (event) {
    if (event.target && event.target.id === 'settings-form') {
      setTimeout(syncPushPreferences, 100);
    }
  });

  window.addEventListener('hashchange', () => setTimeout(updateSettingsUi, 50));
  window.addEventListener('DOMContentLoaded', () => setTimeout(updateSettingsUi, 100));

  window.enablePushNotifications = enablePushNotifications;
  window.disablePushNotifications = disablePushNotifications;
  window.syncPushPreferences = syncPushPreferences;
})();
