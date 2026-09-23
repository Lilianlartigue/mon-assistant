/* Mon Assistant - IA réelle + mémoire locale persistante */
(function () {
  const MAX_HISTORY = 80;
  const ALLOWED_COLLECTIONS = [
    'tasks',
    'shopping',
    'accounts',
    'transactions',
    'goals',
    'events',
    'notes',
    'portfolio',
    'places',
    'settings'
  ];

  function cleanHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
      .filter(function (m) {
        return m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.text === 'string';
      })
      .slice(-MAX_HISTORY)
      .map(function (m) {
        return {
          role: m.role,
          text: m.text.slice(0, 4000)
        };
      });
  }

  function persistHistory() {
    data.assistantHistory = cleanHistory(ui.chat);
    save();
  }

  function assistantContext() {
    return {
      tasks: data.tasks || [],
      shopping: data.shopping || [],
      accounts: data.accounts || [],
      transactions: (data.transactions || []).slice(0, 100),
      goals: data.goals || [],
      events: (data.events || [])
        .slice()
        .sort(function (a, b) {
          return String(a.start || '')
            .localeCompare(String(b.start || ''));
        })
        .slice(-180),
      notes: (data.notes || []).slice(0, 80),
      portfolio: (data.portfolio || []).slice(0, 80),
      places: (data.places || []).slice(0, 80),
      settings: data.settings || {},
      mailConnected: Boolean(data.mailConnected),
      mails: data.mailConnected && Array.isArray(data.mails)
        ? data.mails.slice(0, 60)
        : []
    };
  }

  function actionLabel(action) {
    const operation = {
      create: 'Créer',
      update: 'Modifier',
      delete: 'Supprimer'
    }[action.operation] || 'Modifier';

    const collection = {
      tasks: 'une tâche',
      shopping: 'un article de courses',
      accounts: 'un compte',
      transactions: 'un mouvement financier',
      goals: 'un objectif',
      events: 'un événement',
      notes: 'une note',
      portfolio: 'un élément du portfolio',
      places: 'un lieu',
      settings: 'les paramètres'
    }[action.collection] || action.collection;

    const target = action.match ||
      action.values?.title ||
      action.values?.name ||
      '';

    return operation + ' ' + collection +
      (target ? ' « ' + String(target).slice(0, 80) + ' »' : '');
  }

  function cleanActions(value) {
    const source = Array.isArray(value)
      ? value
      : value && typeof value === 'object'
        ? [value]
        : [];

    return source
      .filter(function (action) {
        return action &&
          ['create', 'update', 'delete'].includes(action.operation) &&
          ALLOWED_COLLECTIONS.includes(action.collection);
      })
      .slice(0, 10)
      .map(function (action) {
        return {
          operation: action.operation,
          collection: action.collection,
          match: String(action.match || '').trim(),
          values: action.values && typeof action.values === 'object'
            ? action.values
            : {}
        };
      });
  }

  function pendingFromActions(value) {
    const actions = cleanActions(value);
    if (!actions.length) return null;

    return {
      actions: actions,
      summary: actions.map(actionLabel).join(' • ')
    };
  }

  async function realAssistant(message) {
    const input = String(message || '').trim();
    if (!input) return;

    const previousHistory = cleanHistory(ui.chat);

    ui.chat.push({
      role: 'user',
      text: input
    });

    ui.chat.push({
      role: 'assistant',
      text: '…'
    });

    persistHistory();
    render();

    try {
      const response = await fetch('/api/assistant-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId:
            localStorage.getItem('assistant_user_id') ||
            'default',
          message: input,
          history: previousHistory,
          context: assistantContext()
        })
      });

      const result = await response.json().catch(function () {
        return {};
      });

      if (
        ui.chat[ui.chat.length - 1] &&
        ui.chat[ui.chat.length - 1].text === '…'
      ) {
        ui.chat.pop();
      }

      if (!response.ok) {
        throw new Error(
          result.error ||
          'Erreur de communication avec l’assistant.'
        );
      }

      ui.chat.push({
        role: 'assistant',
        text: String(result.answer || 'D’accord.')
      });

      const pending = pendingFromActions(
        result.actions || result.action
      );

      if (pending) {
        ui.pendingAction = pending;
      }

      persistHistory();
      render();

    } catch (error) {
      if (
        ui.chat[ui.chat.length - 1] &&
        ui.chat[ui.chat.length - 1].text === '…'
      ) {
        ui.chat.pop();
      }

      console.error(
        'Assistant IA :',
        error
      );

      ui.chat.push({
        role: 'assistant',
        text:
          'Je n’arrive pas à répondre pour le moment. Réessaie dans un instant.'
      });

      persistHistory();
      render();
    }
  }

  handleAssistant = realAssistant;

  if (
    Array.isArray(data.assistantHistory) &&
    data.assistantHistory.length
  ) {
    ui.chat = cleanHistory(
      data.assistantHistory
    );
  } else {
    data.assistantHistory =
      cleanHistory(ui.chat);
    save();
  }

  render();
})();
