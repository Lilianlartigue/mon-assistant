/* Mon Assistant - IA réelle + mémoire locale persistante */
(function () {
  const MAX_HISTORY = 60;

  function cleanHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
      .filter(function (m) { return m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string'; })
      .slice(-MAX_HISTORY)
      .map(function (m) { return { role: m.role, text: m.text.slice(0, 4000) }; });
  }

  function persistHistory() {
    data.assistantHistory = cleanHistory(ui.chat);
    save();
  }

  function assistantContext() {
    return {
      tasks: data.tasks || [],
      courses: data.shopping || [],
      accounts: data.accounts || [],
      transactions: (data.transactions || []).slice(0, 50),
      goals: data.goals || [],
      events: (data.events || []).slice().sort(function (a, b) {
        return String(a.start || '').localeCompare(String(b.start || ''));
      }).slice(-120),
      notes: (data.notes || []).slice(0, 40),
      recipes: (data.recipes || []).slice(0, 40)
    };
  }

  function pendingFromAction(action) {
    if (!action || !action.type || action.type === 'none') return null;

    if (action.type === 'add_task') {
      const title = String(action.name || action.description || 'Nouvelle tâche').trim();
      return {
        type: 'task',
        values: { title: title, priority: 'Normale', due: '', done: false },
        summary: 'Ajouter la tâche « ' + title + ' ».'
      };
    }

    if (action.type === 'add_shopping') {
      const name = String(action.name || action.description || 'Nouvel article').trim();
      return {
        type: 'shopping',
        values: { name: name, quantity: '1', category: 'Autre', priority: 'Normale', done: false },
        summary: 'Ajouter « ' + name + ' » à la liste de courses.'
      };
    }

    return null;
  }

  async function realAssistant(message) {
    const input = String(message || '').trim();
    if (!input) return;

    const previousHistory = cleanHistory(ui.chat);
    ui.chat.push({ role: 'user', text: input });
    persistHistory();
    render();

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: localStorage.getItem('assistant_user_id') || 'default',
          message: input,
          history: previousHistory,
          context: assistantContext()
        })
      });

      const result = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(result.error || 'Erreur de communication avec l’assistant.');

      ui.chat.push({ role: 'assistant', text: String(result.answer || 'D’accord.') });
      const pending = pendingFromAction(result.action);
      if (pending) ui.pendingAction = pending;
      persistHistory();
      render();
    } catch (error) {
      console.error('Assistant IA :', error);
      ui.chat.push({ role: 'assistant', text: 'Je n’arrive pas à joindre l’IA pour le moment : ' + (error.message || 'erreur inconnue') });
      persistHistory();
      render();
    }
  }

  /* Remplace l’ancien assistant local défini dans app.js. */
  handleAssistant = realAssistant;

  /* Recharge les anciennes discussions sauvegardées sur cet appareil. */
  if (Array.isArray(data.assistantHistory) && data.assistantHistory.length) {
    ui.chat = cleanHistory(data.assistantHistory);
  } else {
    data.assistantHistory = cleanHistory(ui.chat);
    save();
  }

  render();
})();
