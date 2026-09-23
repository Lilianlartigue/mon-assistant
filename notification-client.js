(function () {
  function urlBase64ToUint8Array(
    base64String
  ) {
    const padding =
      '='.repeat(
        (
          4 -
          base64String.length % 4
        ) % 4
      );

    const base64 =
      (
        base64String +
        padding
      )
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const raw =
      atob(base64);

    return Uint8Array.from(
      [...raw].map(
        function (char) {
          return char.charCodeAt(0);
        }
      )
    );
  }

  async function registration() {
    if (
      !(
        'serviceWorker' in
        navigator
      )
    ) {
      throw new Error(
        'Service worker indisponible.'
      );
    }

    let value =
      await navigator
        .serviceWorker
        .getRegistration();

    if (!value) {
      value =
        await navigator
          .serviceWorker
          .register(
            '/sw.js',
            {
              updateViaCache:
                'none'
            }
          );
    }

    await navigator
      .serviceWorker
      .ready;

    return value;
  }

  function preferences() {
    return {
      timezone:
        Intl
          .DateTimeFormat()
          .resolvedOptions()
          .timeZone ||
        'Europe/Paris',

      quietStart:
        data?.settings
          ?.quietStart ||
        '22:00',

      quietEnd:
        data?.settings
          ?.quietEnd ||
        '08:00'
    };
  }

  async function postSubscription(
    subscription
  ) {
    const response =
      await fetch(
        '/api/push-subscribe',
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          cache:
            'no-store',

          body:
            JSON.stringify({
              subscription:
                subscription.toJSON(),

              preferences:
                preferences()
            })
        }
      );

    const payload =
      await response
        .json()
        .catch(
          function () {
            return {};
          }
        );

    if (!response.ok) {
      throw new Error(
        payload.error ||
        'Impossible d’enregistrer les notifications.'
      );
    }
  }

  async function getSubscription() {
    const reg =
      await registration();

    return reg
      .pushManager
      .getSubscription();
  }

  async function enable() {
    if (
      !(
        'Notification' in
        window
      ) ||
      !(
        'PushManager' in
        window
      )
    ) {
      throw new Error(
        'Les notifications push ne sont pas disponibles ici. Sur iPhone, ouvre Mon assistant depuis l’icône ajoutée à l’écran d’accueil.'
      );
    }

    const permission =
      await Notification
        .requestPermission();

    if (
      permission !==
      'granted'
    ) {
      throw new Error(
        'Autorisation de notification refusée.'
      );
    }

    const reg =
      await registration();

    let subscription =
      await reg
        .pushManager
        .getSubscription();

    if (!subscription) {
      const response =
        await fetch(
          '/api/push-public-key',
          {
            cache:
              'no-store'
          }
        );

      const payload =
        await response
          .json()
          .catch(
            function () {
              return {};
            }
          );

      if (
        !response.ok ||
        !payload.publicKey
      ) {
        throw new Error(
          payload.error ||
          'Clé de notification indisponible.'
        );
      }

      subscription =
        await reg
          .pushManager
          .subscribe({
            userVisibleOnly:
              true,

            applicationServerKey:
              urlBase64ToUint8Array(
                payload.publicKey
              )
          });
    }

    await postSubscription(
      subscription
    );

    data.settings.notifications =
      true;

    save();

    await updateUi();

    showToast(
      'Notifications personnalisées activées.'
    );

    return subscription;
  }

  async function disable() {
    const subscription =
      await getSubscription();

    if (subscription) {
      await fetch(
        '/api/push-subscribe',
        {
          method:
            'DELETE',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              subscription:
                subscription.toJSON()
            })
        }
      ).catch(
        function () {}
      );

      await subscription
        .unsubscribe()
        .catch(
          function () {}
        );
    }

    data.settings.notifications =
      false;

    save();

    await updateUi();

    showToast(
      'Notifications désactivées.'
    );
  }

  async function syncPreferences() {
    try {
      if (
        !(
          'Notification' in
          window
        ) ||
        Notification.permission !==
          'granted'
      ) {
        return;
      }

      const subscription =
        await getSubscription();

      if (subscription) {
        await postSubscription(
          subscription
        );
      }

    } catch (error) {
      console.error(
        'Préférences push:',
        error
      );
    }
  }

  async function testNotification() {
    let subscription =
      await getSubscription();

    if (
      !subscription ||
      Notification.permission !==
        'granted'
    ) {
      subscription =
        await enable();
    }

    const response =
      await fetch(
        '/api/push-test',
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              endpoint:
                subscription.endpoint
            })
        }
      );

    const payload =
      await response
        .json()
        .catch(
          function () {
            return {};
          }
        );

    if (!response.ok) {
      throw new Error(
        payload.error ||
        'Impossible d’envoyer le test.'
      );
    }

    showToast(
      'Notification test envoyée.'
    );
  }

  async function updateUi() {
    if (
      !location.hash
        .startsWith(
          '#/settings'
        )
    ) {
      return;
    }

    const button =
      document.querySelector(
        '[data-action="request-notifications"]'
      );

    if (!button) {
      return;
    }

    try {
      const subscription =
        await getSubscription();

      const active =
        Boolean(
          subscription
        ) &&
        Notification.permission ===
          'granted';

      button.textContent =
        active
          ? 'Désactiver'
          : 'Activer';

      button.dataset.pushActive =
        active
          ? '1'
          : '0';

      const row =
        button.closest(
          '.settings-row'
        );

      const paragraph =
        row
          ?.querySelector(
            '.item-main p'
          );

      if (paragraph) {
        paragraph.textContent =
          active
            ? 'État actuel : notifications personnalisées actives'
            : 'État actuel : ' +
              (
                Notification.permission ||
                'non autorisées'
              );
      }

      const testButton =
        document.querySelector(
          '[data-action="test-notification"]'
        );

      if (testButton) {
        testButton.disabled =
          !active;
      }

    } catch (_error) {}
  }

  document.addEventListener(
    'click',
    function (event) {
      const button =
        event.target.closest(
          '[data-action="request-notifications"], [data-action="test-notification"]'
        );

      if (!button) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      button.disabled =
        true;

      let promise;

      if (
        button.dataset.action ===
        'test-notification'
      ) {
        promise =
          testNotification();

      } else {
        promise =
          button.dataset.pushActive ===
            '1'
            ? disable()
            : enable();
      }

      Promise
        .resolve(promise)
        .catch(
          function (error) {
            console.error(
              'Notifications:',
              error
            );

            showToast(
              error.message ||
              'Erreur notifications.'
            );
          }
        )
        .finally(
          function () {
            button.disabled =
              false;

            updateUi();
          }
        );
    },
    true
  );

  document.addEventListener(
    'submit',
    function (event) {
      if (
        event.target &&
        event.target.id ===
          'settings-form'
      ) {
        setTimeout(
          syncPreferences,
          100
        );
      }
    }
  );

  window.addEventListener(
    'hashchange',
    function () {
      setTimeout(
        updateUi,
        50
      );
    }
  );

  window.addEventListener(
    'load',
    function () {
      setTimeout(
        async function () {
          await syncPreferences();
          await updateUi();
        },
        250
      );
    }
  );

  window.personalNotifications = {
    enable,
    disable,
    test:
      testNotification,
    sync:
      syncPreferences
  };
})();
