const STORAGE_KEY = 'mon-assistant-data-v2';

const pages = [
  ['home', '🏠', 'Accueil'],
  ['assistant', '🤖', 'Assistant IA'],
  ['calendar', '📅', 'Calendrier'],
  ['tasks', '✓', 'Tâches'],
  ['shopping', '🛒', 'Courses'],
  ['finance', '💰', 'Finances'],
  ['mail', '📧', 'Mails'],
  ['map', '🗺️', 'Carte'],
  ['notes', '📝', 'Notes'],
  ['cooking', '👨‍🍳', 'Cuisine'],
  ['settings', '⚙️', 'Paramètres']
];

const priorityOrder = { Urgente: 0, Importante: 1, Normale: 2, Faible: 3 };
const categories = ['Personnel', 'Travail', 'Santé', 'Autre'];

function id(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function dayShift(offset) {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 16);
}

function defaultData() {
  return {
    tasks: [
      { id: id('task'), title: 'Répondre aux messages importants', priority: 'Importante', due: dayShift(0).slice(0, 10), done: false },
      { id: id('task'), title: 'Faire les courses de la semaine', priority: 'Normale', due: dayShift(0).slice(0, 10), done: false },
      { id: id('task'), title: 'Planifier le week-end', priority: 'Faible', due: dayShift(2).slice(0, 10), done: false }
    ],
    shopping: [
      { id: id('shop'), name: 'Lait', quantity: '2', category: 'Épicerie', priority: 'Normale', done: false },
      { id: id('shop'), name: 'Fruits de saison', quantity: '1 kg', category: 'Fruits et légumes', priority: 'Importante', done: false }
    ],
    accounts: [
      { id: 'current', name: 'Compte courant', balance: 1250, allocation: 70 },
      { id: 'livret', name: 'Livret A', balance: 5400, allocation: 30 }
    ],
    transactions: [],
    goals: [{ id: id('goal'), name: 'Voyage', target: 1200, saved: 350 }],
    events: [
      { id: id('event'), title: 'Déjeuner', start: dayShift(0).slice(0, 11) + '12:30', end: dayShift(0).slice(0, 11) + '13:30', category: 'Personnel' },
      { id: id('event'), title: 'Appel', start: dayShift(1).slice(0, 11) + '10:00', end: dayShift(1).slice(0, 11) + '10:30', category: 'Travail' }
    ],
    notes: [{ id: id('note'), title: 'Bienvenue', content: 'Toutes vos données restent dans le navigateur de cet appareil.', updatedAt: new Date().toISOString() }],
    recipes: [{ id: id('recipe'), title: 'Pâtes tomate basilic', ingredients: 'Pâtes, tomates, basilic, parmesan', servings: 2, method: 'Cuire les pâtes puis mélanger avec la sauce tomate et le basilic.' }],
    places: [{ id: id('place'), name: 'Maison', category: 'Favori', address: '', latitude: '', longitude: '' }],
    settings: { quietStart: '22:00', quietEnd: '08:00', notifications: false }
  };
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') return { ...defaultData(), ...saved };
  } catch (error) {}
  return defaultData();
}

let data = loadData();
let ui = {
  taskFilter: 'Toutes',
  shoppingFilter: 'Toutes',
  calendarDate: new Date(),
  calendarView: 'month',
  eventEditing: null,
  noteEditing: null,
  recipeEditing: null,
  placeEditing: null,
  pendingAction: null,
  chat: [{ role: 'assistant', text: 'Bonjour ! Je peux organiser tes tâches, courses, finances, calendrier et notes. Que souhaites-tu faire ?' }]
};

const app = document.querySelector('#app');
const nav = document.querySelector('#sidebar-nav');
const sidebar = document.querySelector('#sidebar');
const overlay = document.querySelector('#overlay');
const menu = document.querySelector('#menu-button');
const toast = document.querySelector('#toast');

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, function(char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char];
  });
}

function money(value) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}

function number(value) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function dateInput(value) {
  return value ? String(value).slice(0, 10) : '';
}

function dateLabel(value, withTime) {
  if (!value) return 'Sans date';
  const date = new Date(value);
  return new Intl.DateTimeFormat('fr-FR', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' }).format(date);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function pageId() {
  const page = location.hash.replace('#/', '') || 'home';
  return pages.some(function(item) { return item[0] === page; }) ? page : 'home';
}

function closeMenu() {
  sidebar.classList.remove('open');
  overlay.classList.remove('visible');
  menu.setAttribute('aria-expanded', 'false');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(function() { toast.classList.remove('show'); }, 2800);
}

function empty(title, text) {
  return '<div class="empty"><strong>' + escapeHtml(title) + '</strong><p>' + escapeHtml(text) + '</p></div>';
}

function heading(eyebrow, title, text, button) {
  return '<div class="page-heading"><div><p class="eyebrow">' + eyebrow + '</p><h1>' + title + '</h1><p>' + text + '</p></div>' + (button || '') + '</div>';
}

function card(title, content, action) {
  return '<section class="card"><div class="card-head"><h2>' + title + '</h2>' + (action || '') + '</div>' + content + '</section>';
}

function priorityBadge(priority) {
  return '<span class="badge priority-' + priority.toLowerCase() + '">' + priority + '</span>';
}

function sortTasks(items) {
  return items.slice().sort(function(a, b) {
    if (a.done !== b.done) return Number(a.done) - Number(b.done);
    const priority = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priority) return priority;
    return String(a.due || '9999').localeCompare(String(b.due || '9999'));
  });
}

function totalBalance() {
  return data.accounts.reduce(function(sum, account) { return sum + Number(account.balance || 0); }, 0);
}

function accountById(accountId) {
  return data.accounts.find(function(account) { return account.id === accountId; });
}

function renderNav(active) {
  nav.innerHTML = pages.map(function(item) {
    return '<button class="nav-button ' + (item[0] === active ? 'active' : '') + '" data-page="' + item[0] + '" type="button"><span class="nav-icon">' + item[1] + '</span><span>' + item[2] + '</span></button>';
  }).join('');
}

function renderHome() {
  const openTasks = sortTasks(data.tasks.filter(function(task) { return !task.done; })).slice(0, 4);
  const upcoming = data.events.slice().sort(function(a, b) { return a.start.localeCompare(b.start); }).filter(function(event) { return new Date(event.start) >= new Date(new Date().setHours(0, 0, 0, 0)); }).slice(0, 3);
  const total = totalBalance();
  const taskItems = openTasks.length ? openTasks.map(function(task) {
    return '<li><button class="check" data-action="toggle-task" data-id="' + task.id + '" aria-label="Terminer"></button><span class="item-main"><strong>' + escapeHtml(task.title) + '</strong><br><small>' + priorityBadge(task.priority) + '</small></span><small>' + (task.due ? dateLabel(task.due) : 'Sans date') + '</small></li>';
  }).join('') : '<li><span>Tout est terminé, bravo !</span></li>';
  const eventItems = upcoming.length ? upcoming.map(function(event) {
    return '<li><span class="event-dot ' + (event.category === 'Travail' ? 'blue-dot' : '') + '"></span><span class="item-main"><strong>' + escapeHtml(event.title) + '</strong><br><small>' + dateLabel(event.start, true) + '</small></span></li>';
  }).join('') : '<li><span>Aucun événement à venir.</span></li>';
  const savings = data.accounts.find(function(account) { return account.id === 'livret'; });
  const savingPercent = total ? Math.min(100, Math.round((Number(savings ? savings.balance : 0) / total) * 100)) : 0;
  const shortcuts = [
    ['tasks', '✓', 'Tâches', openTasks.length + ' à faire', 'violet'],
    ['calendar', '📅', 'Calendrier', upcoming.length + ' événement(s)', 'blue'],
    ['shopping', '🛒', 'Courses', data.shopping.filter(function(item) { return !item.done; }).length + ' article(s)', 'yellow'],
    ['finance', '💰', 'Finances', money(total), 'green'],
    ['notes', '📝', 'Notes', data.notes.length + ' note(s)', 'pink'],
    ['cooking', '👨‍🍳', 'Cuisine', data.recipes.length + ' recette(s)', 'orange']
  ];
  return heading('BONJOUR', 'Votre journée en un coup d’œil', 'Retrouve ici ce qui mérite ton attention.', '<button class="primary-button" data-page="assistant">Demander à l’IA</button>') +
    '<section class="quick-grid">' + shortcuts.map(function(item) {
      return '<button class="quick-card" data-page="' + item[0] + '"><span class="quick-icon ' + item[4] + '">' + item[1] + '</span><strong>' + item[2] + '</strong><small>' + item[3] + '</small></button>';
    }).join('') + '</section>' +
    '<section class="dashboard-grid">' +
      card('À faire aujourd’hui', '<ul class="list">' + taskItems + '</ul>', '<button class="text-button" data-page="tasks">Tout voir</button>') +
      '<div class="side-stack">' +
        card('Prochains événements', '<ul class="list">' + eventItems + '</ul>', '<button class="text-button" data-page="calendar">Agenda</button>') +
        card('Vue financière', '<div class="balance"><strong class="money">' + money(total) + '</strong><p>' + savingPercent + ' % de votre épargne sur le Livret A.</p><div class="progress"><span style="width:' + savingPercent + '%"></span></div></div>', '<button class="text-button" data-page="finance">Détails</button>') +
      '</div>' +
    '</section>';
}

function renderTasks() {
  const tasks = sortTasks(data.tasks).filter(function(task) { return ui.taskFilter === 'Toutes' || task.priority === ui.taskFilter; });
  const rows = tasks.length ? tasks.map(function(task) {
    return '<div class="item-row ' + (task.done ? 'completed' : '') + '"><button class="check ' + (task.done ? 'done' : '') + '" data-action="toggle-task" data-id="' + task.id + '" aria-label="Changer l’état"></button><div class="item-main"><span class="item-title">' + escapeHtml(task.title) + '</span><div class="item-meta">' + priorityBadge(task.priority) + (task.due ? '<span>Échéance : ' + dateLabel(task.due) + '</span>' : '') + '</div></div><button class="icon-action" data-action="edit-task" data-id="' + task.id + '" aria-label="Modifier">✎</button><button class="icon-action" data-action="delete-task" data-id="' + task.id + '" aria-label="Supprimer">×</button></div>';
  }).join('') : empty('Aucune tâche', 'Ajoutez votre première tâche ci-dessus.');
  const editing = ui.taskEditing ? data.tasks.find(function(task) { return task.id === ui.taskEditing; }) : null;
  return heading('ORGANISATION', 'Tâches', 'Les tâches sont triées automatiquement par état, priorité et date limite.', '<button class="primary-button" data-action="focus-task">Ajouter une tâche</button>') +
    '<div class="two-columns"><div class="stack">' +
      card(editing ? 'Modifier la tâche' : 'Nouvelle tâche',
        '<div class="card-body"><form id="task-form"><input type="hidden" name="id" value="' + (editing ? editing.id : '') + '"><div class="form-grid"><label class="field full">Tâche<input id="task-title" required name="title" value="' + escapeHtml(editing ? editing.title : '') + '" placeholder="Ex. Appeler le médecin"></label><label class="field">Priorité<select name="priority">' + ['Urgente', 'Importante', 'Normale', 'Faible'].map(function(priority) { return '<option ' + ((editing ? editing.priority : 'Normale') === priority ? 'selected' : '') + '>' + priority + '</option>'; }).join('') + '</select></label><label class="field">Date limite<input type="date" name="due" value="' + dateInput(editing ? editing.due : '') + '"></label></div><div class="form-actions"><button class="primary-button" type="submit">' + (editing ? 'Enregistrer' : 'Ajouter la tâche') + '</button>' + (editing ? '<button class="secondary-button" type="button" data-action="cancel-task">Annuler</button>' : '') + '</div></form></div>') +
      card('Mes tâches', '<div class="card-body"><div class="filter-bar">' + ['Toutes', 'Urgente', 'Importante', 'Normale', 'Faible'].map(function(filter) { return '<button class="filter-chip ' + (filter === ui.taskFilter ? 'active' : '') + '" data-action="task-filter" data-filter="' + filter + '">' + filter + '</button>'; }).join('') + '</div><div class="item-list">' + rows + '</div></div>') +
    '</div><div class="stack">' +
      card('Priorités', '<div class="card-body"><p class="section-note"><strong>Urgente</strong> : à traiter sans attendre.<br><br><strong>Importante</strong> : essentielle à votre journée.<br><br><strong>Normale</strong> : à faire dès que possible.<br><br><strong>Faible</strong> : à garder en vue.</p></div>') +
    '</div></div>';
}

function renderShopping() {
  const categoriesShop = ['Fruits et légumes', 'Épicerie', 'Frais', 'Maison', 'Hygiène', 'Autre'];
  const items = sortTasks(data.shopping).filter(function(item) { return ui.shoppingFilter === 'Toutes' || item.category === ui.shoppingFilter; });
  const rows = items.length ? items.map(function(item) {
    return '<div class="item-row ' + (item.done ? 'completed' : '') + '"><button class="check ' + (item.done ? 'done' : '') + '" data-action="toggle-shopping" data-id="' + item.id + '" aria-label="Changer l’état"></button><div class="item-main"><span class="item-title">' + escapeHtml(item.name) + ' <span class="badge category-badge">' + escapeHtml(item.quantity || '1') + '</span></span><div class="item-meta">' + priorityBadge(item.priority) + '<span class="badge category-badge">' + escapeHtml(item.category) + '</span></div></div><button class="icon-action" data-action="edit-shopping" data-id="' + item.id + '" aria-label="Modifier">✎</button><button class="icon-action" data-action="delete-shopping" data-id="' + item.id + '" aria-label="Supprimer">×</button></div>';
  }).join('') : empty('La liste est vide', 'Ajoutez ce dont vous avez besoin.');
  const editing = ui.shoppingEditing ? data.shopping.find(function(item) { return item.id === ui.shoppingEditing; }) : null;
  return heading('ORGANISATION', 'Courses', 'Une liste claire, organisée par catégorie et priorité.', '<button class="primary-button" data-action="focus-shopping">Ajouter un article</button>') +
    '<div class="two-columns"><div class="stack">' +
      card(editing ? 'Modifier un article' : 'Ajouter un article',
        '<div class="card-body"><form id="shopping-form"><input type="hidden" name="id" value="' + (editing ? editing.id : '') + '"><div class="form-grid"><label class="field full">Produit<input id="shopping-name" required name="name" value="' + escapeHtml(editing ? editing.name : '') + '" placeholder="Ex. Yaourts"></label><label class="field">Quantité<input name="quantity" value="' + escapeHtml(editing ? editing.quantity : '1') + '" placeholder="Ex. 2 paquets"></label><label class="field">Catégorie<select name="category">' + categoriesShop.map(function(category) { return '<option ' + ((editing ? editing.category : 'Épicerie') === category ? 'selected' : '') + '>' + category + '</option>'; }).join('') + '</select></label><label class="field">Priorité<select name="priority">' + ['Urgente', 'Importante', 'Normale', 'Faible'].map(function(priority) { return '<option ' + ((editing ? editing.priority : 'Normale') === priority ? 'selected' : '') + '>' + priority + '</option>'; }).join('') + '</select></label></div><div class="form-actions"><button class="primary-button" type="submit">' + (editing ? 'Enregistrer' : 'Ajouter à la liste') + '</button>' + (editing ? '<button class="secondary-button" type="button" data-action="cancel-shopping">Annuler</button>' : '') + '</div></form></div>') +
      card('Ma liste', '<div class="card-body"><div class="filter-bar">' + ['Toutes'].concat(categoriesShop).map(function(filter) { return '<button class="filter-chip ' + (filter === ui.shoppingFilter ? 'active' : '') + '" data-action="shopping-filter" data-filter="' + filter + '">' + filter + '</button>'; }).join('') + '</div><div class="item-list">' + rows + '</div></div>') +
    '</div><div class="stack">' +
      card('Résumé', '<div class="card-body"><div class="three-columns"><div class="stat-card"><p>À acheter</p><strong>' + data.shopping.filter(function(item) { return !item.done; }).length + '</strong></div><div class="stat-card"><p>Urgents</p><strong>' + data.shopping.filter(function(item) { return !item.done && item.priority === 'Urgente'; }).length + '</strong></div><div class="stat-card"><p>Terminés</p><strong>' + data.shopping.filter(function(item) { return item.done; }).length + '</strong></div></div></div>') +
    '</div></div>';
}

function renderFinance() {
  const allocation = data.accounts.reduce(function(sum, account) { return sum + Number(account.allocation || 0); }, 0);
  const allocationOk = Math.abs(allocation - 100) < .01;
  const accountFields = data.accounts.map(function(account) {
    return '<div class="allocation-row"><label class="field">' + escapeHtml(account.name) + '<input name="balance-' + account.id + '" type="number" step="0.01" value="' + Number(account.balance || 0) + '"></label><label class="field">Répartition<input name="allocation-' + account.id + '" type="number" min="0" max="100" step="1" value="' + Number(account.allocation || 0) + '"></label><div class="money">' + money(account.balance) + '</div></div>';
  }).join('');
  const transactions = data.transactions.slice(0, 8).map(function(transaction) {
    const account = accountById(transaction.accountId);
    return '<div class="transaction"><span class="transaction-icon ' + (transaction.type === 'add' ? 'transaction-in' : 'transaction-out') + '">' + (transaction.type === 'add' ? '+' : '−') + '</span><div class="transaction-main"><strong>' + escapeHtml(transaction.note || (transaction.type === 'add' ? 'Ajout d’argent' : 'Retrait d’argent')) + '</strong><br><small>' + escapeHtml(account ? account.name : '') + ' · ' + dateLabel(transaction.createdAt, true) + '</small></div><strong class="' + (transaction.type === 'add' ? 'positive' : 'negative') + '">' + (transaction.type === 'add' ? '+' : '−') + money(transaction.amount) + '</strong></div>';
  }).join('') || empty('Aucun mouvement', 'Vos ajouts et retraits apparaîtront ici.');
  const goals = data.goals.map(function(goal) {
    const percent = goal.target ? Math.min(100, Math.round((goal.saved / goal.target) * 100)) : 0;
    return '<div class="goal"><div class="goal-line"><strong>' + escapeHtml(goal.name) + '</strong><span>' + money(goal.saved) + ' / ' + money(goal.target) + '</span></div><div class="progress"><span style="width:' + percent + '%"></span></div><div class="card-actions"><button class="text-button" data-action="add-goal-savings" data-id="' + goal.id + '">Ajouter une épargne</button><button class="text-button" data-action="delete-goal" data-id="' + goal.id + '">Supprimer</button></div></div>';
  }).join('') || empty('Aucun objectif', 'Créez un objectif financier.');
  return heading('BUDGET', 'Finances', 'Gérez vos comptes, vos répartitions et vos objectifs.', '<button class="primary-button" data-action="focus-money">Ajouter un mouvement</button>') +
    '<div class="three-columns"><section class="card stat-card"><p>Total général</p><strong class="money">' + money(totalBalance()) + '</strong></section>' + data.accounts.map(function(account) { return '<section class="card stat-card"><p>' + escapeHtml(account.name) + '</p><strong class="money">' + money(account.balance) + '</strong></section>'; }).join('') + '</div>' +
    '<div class="two-columns" style="margin-top:21px"><div class="stack">' +
      card('Comptes et répartitions', '<div class="card-body"><form id="accounts-form">' + accountFields + '<p class="allocation-total ' + (allocationOk ? '' : 'invalid') + '">Répartition totale : ' + number(allocation) + ' %' + (allocationOk ? ' ✓' : ' — elle doit faire 100 %.') + '</p><div class="form-actions"><button class="primary-button" type="submit">Enregistrer les comptes</button></div></form></div>') +
      card('Historique des mouvements', '<div class="card-body">' + transactions + '</div>') +
    '</div><div class="stack">' +
      card('Ajouter ou retirer de l’argent', '<div class="card-body"><form id="money-form"><div class="form-grid"><label class="field">Opération<select name="type"><option value="add">Ajouter de l’argent</option><option value="remove">Retirer de l’argent</option></select></label><label class="field">Compte<select name="accountId">' + data.accounts.map(function(account) { return '<option value="' + account.id + '">' + escapeHtml(account.name) + '</option>'; }).join('') + '</select></label><label class="field">Montant<input id="money-amount" required name="amount" type="number" min="0.01" step="0.01" placeholder="0,00"></label><label class="field">Motif (optionnel)<input name="note" placeholder="Ex. Salaire"></label></div><div class="form-actions"><button class="primary-button" type="submit">Enregistrer le mouvement</button></div></form></div>') +
      card('Objectifs financiers', '<div class="card-body"><div>' + goals + '</div><form id="goal-form" style="margin-top:14px"><div class="form-grid"><label class="field">Nom<input required name="name" placeholder="Ex. Permis"></label><label class="field">Montant cible<input required name="target" type="number" min="1" step="0.01"></label></div><div class="form-actions"><button class="secondary-button" type="submit">Créer un objectif</button></div></form></div>') +
    '</div></div>';
}

function eventsForDate(date) {
  return data.events.filter(function(event) { return isSameDay(new Date(event.start), date); }).sort(function(a, b) { return a.start.localeCompare(b.start); });
}

function weekStart(date) {
  const value = new Date(date);
  const day = value.getDay() || 7;
  value.setDate(value.getDate() - day + 1);
  value.setHours(0, 0, 0, 0);
  return value;
}

function calendarGrid() {
  const reference = new Date(ui.calendarDate);
  const now = new Date();
  if (ui.calendarView === 'day') {
    const events = eventsForDate(reference);
    return '<div class="agenda-list">' + (events.length ? events.map(function(event) {
      return '<div class="agenda-item"><div class="agenda-date">' + dateLabel(event.start, true).replace(' ', '<br>') + '</div><div class="item-main" data-action="edit-event" data-id="' + event.id + '"><strong>' + escapeHtml(event.title) + '</strong><br><small>' + escapeHtml(event.category) + ' · jusqu’à ' + dateLabel(event.end, true) + '</small></div><button class="icon-action" data-action="delete-event" data-id="' + event.id + '">×</button></div>';
    }).join('') : empty('Journée libre', 'Ajoutez un événement à cette date.')) + '</div>';
  }
  const isWeek = ui.calendarView === 'week';
  const first = isWeek ? weekStart(reference) : new Date(reference.getFullYear(), reference.getMonth(), 1);
  const start = new Date(first);
  if (!isWeek) start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = isWeek ? 7 : 42;
  const headers = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(function(label) { return '<div class="weekday">' + label + '</div>'; }).join('');
  let cells = '';
  for (let index = 0; index < days; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const muted = !isWeek && date.getMonth() !== reference.getMonth();
    const eventButtons = eventsForDate(date).map(function(event) {
      const type = event.category === 'Travail' ? ' work' : event.category === 'Personnel' ? ' personal' : '';
      return '<button class="calendar-event' + type + '" data-action="edit-event" data-id="' + event.id + '" title="' + escapeHtml(event.title) + '">' + dateLabel(event.start, true).split(' ')[1] + ' ' + escapeHtml(event.title) + '</button>';
    }).join('');
    cells += '<div class="calendar-day ' + (muted ? 'muted ' : '') + (isSameDay(date, now) ? 'today' : '') + '"><span class="day-number">' + date.getDate() + '</span>' + eventButtons + '</div>';
  }
  return '<div class="calendar-grid">' + headers + cells + '</div>';
}

function renderCalendar() {
  const current = new Date(ui.calendarDate);
  const title = ui.calendarView === 'month' ? new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(current) : ui.calendarView === 'week' ? 'Semaine du ' + dateLabel(weekStart(current)) : dateLabel(current);
  const editing = ui.eventEditing ? data.events.find(function(event) { return event.id === ui.eventEditing; }) : null;
  return heading('PLANNING', 'Calendrier', 'Organisez vos journées et retrouvez vos prochains rendez-vous.', '<button class="primary-button" data-action="new-event">Ajouter un événement</button>') +
    '<div class="two-columns"><div class="stack">' +
      card('<span class="calendar-title">' + title + '</span>', '<div class="card-body"><div class="calendar-toolbar"><div class="toolbar-group"><button class="secondary-button" data-action="calendar-prev">‹</button><button class="secondary-button" data-action="calendar-today">Aujourd’hui</button><button class="secondary-button" data-action="calendar-next">›</button></div><div class="toolbar-group">' + ['day', 'week', 'month'].map(function(view) { return '<button class="filter-chip ' + (view === ui.calendarView ? 'active' : '') + '" data-action="calendar-view" data-view="' + view + '">' + ({ day: 'Jour', week: 'Semaine', month: 'Mois' }[view]) + '</button>'; }).join('') + '</div></div>' + calendarGrid() + '</div>') +
    '</div><div class="stack">' +
      card(editing ? 'Modifier l’événement' : 'Nouvel événement', '<div class="card-body"><form id="event-form"><input type="hidden" name="id" value="' + (editing ? editing.id : '') + '"><div class="form-grid"><label class="field full">Titre<input required name="title" value="' + escapeHtml(editing ? editing.title : '') + '" placeholder="Ex. Rendez-vous médecin"></label><label class="field">Début<input required name="start" type="datetime-local" value="' + (editing ? editing.start : dayShift(0)) + '"></label><label class="field">Fin<input required name="end" type="datetime-local" value="' + (editing ? editing.end : dayShift(0)) + '"></label><label class="field full">Catégorie<select name="category">' + categories.map(function(category) { return '<option ' + ((editing ? editing.category : 'Personnel') === category ? 'selected' : '') + '>' + category + '</option>'; }).join('') + '</select></label></div><div class="form-actions"><button class="primary-button" type="submit">' + (editing ? 'Enregistrer' : 'Ajouter à l’agenda') + '</button>' + (editing ? '<button class="secondary-button" type="button" data-action="cancel-event">Annuler</button><button class="danger-button" type="button" data-action="delete-event" data-id="' + editing.id + '">Supprimer</button>' : '') + '</div></form></div>') +
      card('Prochains événements', '<div class="card-body"><div class="agenda-list">' + data.events.slice().sort(function(a, b) { return a.start.localeCompare(b.start); }).filter(function(event) { return new Date(event.start) >= new Date(new Date().setHours(0, 0, 0, 0)); }).slice(0, 6).map(function(event) { return '<div class="agenda-item"><div class="agenda-date">' + dateLabel(event.start, true).replace(' ', '<br>') + '</div><div class="item-main" data-action="edit-event" data-id="' + event.id + '"><strong>' + escapeHtml(event.title) + '</strong><br><small>' + escapeHtml(event.category) + '</small></div></div>'; }).join('') + '</div></div>') +
    '</div></div>';
}

function renderAssistant() {
  const conversation = ui.chat.map(function(message) { return '<div class="message ' + message.role + '">' + escapeHtml(message.text) + '</div>'; }).join('');
  const confirmation = ui.pendingAction ? '<div class="confirm-box"><p><strong>Confirmation requise</strong><br>' + escapeHtml(ui.pendingAction.summary) + '</p><button class="primary-button" data-action="assistant-confirm">Confirmer</button> <button class="secondary-button" data-action="assistant-cancel">Annuler</button></div>' : '';
  return heading('ASSISTANT PERSONNEL', 'Assistant IA', 'Il connaît les données enregistrées dans cet espace et demande confirmation avant toute modification.', '') +
    '<div class="two-columns"><div class="stack">' +
      card('Conversation', '<div class="assistant-chat">' + conversation + confirmation + '</div><form id="assistant-form" class="assistant-composer"><input required name="message" placeholder="Ex. Combien de tâches restent à faire ?"><button class="primary-button" type="submit">Envoyer</button></form><div class="suggestions"><button class="suggestion" data-action="assistant-suggestion" data-message="Combien de tâches restent à faire ?">Mes tâches</button><button class="suggestion" data-action="assistant-suggestion" data-message="Quel est mon total financier ?">Mes finances</button><button class="suggestion" data-action="assistant-suggestion" data-message="Quels sont mes prochains événements ?">Mon agenda</button><button class="suggestion" data-action="assistant-suggestion" data-message="Ajoute une tâche : appeler le médecin">Ajouter une tâche</button></div>') +
    '</div><div class="stack">' +
      card('Données accessibles', '<div class="card-body"><p class="section-note">✓ Tâches<br><br>✓ Courses<br><br>✓ Finances<br><br>✓ Calendrier<br><br>✓ Notes</p></div>') +
      card('Confidentialité', '<div class="card-body"><p class="section-note">Cette version fonctionne localement. Pour un modèle IA externe, une clé API et une fonction serveur sécurisée sont nécessaires : ne mettez jamais une clé secrète directement dans ce fichier.</p></div>') +
    '</div></div>';
}

function renderNotes() {
  const editing = ui.noteEditing ? data.notes.find(function(note) { return note.id === ui.noteEditing; }) : null;
  const noteCards = data.notes.slice().sort(function(a, b) { return b.updatedAt.localeCompare(a.updatedAt); }).map(function(note) {
    return '<article class="note-card"><h3>' + escapeHtml(note.title) + '</h3><p>' + escapeHtml(note.content).replace(/\n/g, '<br>') + '</p><small>Modifiée le ' + dateLabel(note.updatedAt, true) + '</small><div class="card-actions"><button class="text-button" data-action="edit-note" data-id="' + note.id + '">Modifier</button><button class="text-button" data-action="delete-note" data-id="' + note.id + '">Supprimer</button></div></article>';
  }).join('') || empty('Aucune note', 'Créez une note pour commencer.');
  return heading('MÉMOIRE', 'Notes', 'Conservez vos idées, vos listes et vos informations importantes.', '<button class="primary-button" data-action="new-note">Nouvelle note</button>') +
    '<div class="two-columns"><div class="stack">' + card('Mes notes', '<div class="card-body"><div class="notes-grid">' + noteCards + '</div></div>') + '</div><div class="stack">' +
      card(editing ? 'Modifier la note' : 'Nouvelle note', '<div class="card-body"><form id="note-form"><input type="hidden" name="id" value="' + (editing ? editing.id : '') + '"><div class="form-grid"><label class="field full">Titre<input required name="title" value="' + escapeHtml(editing ? editing.title : '') + '" placeholder="Titre de la note"></label><label class="field full">Contenu<textarea required name="content" placeholder="Écrivez votre note…">' + escapeHtml(editing ? editing.content : '') + '</textarea></label></div><div class="form-actions"><button class="primary-button" type="submit">' + (editing ? 'Enregistrer' : 'Créer la note') + '</button>' + (editing ? '<button class="secondary-button" type="button" data-action="cancel-note">Annuler</button>' : '') + '</div></form></div>') +
    '</div></div>';
}

function renderCooking() {
  const editing = ui.recipeEditing ? data.recipes.find(function(recipe) { return recipe.id === ui.recipeEditing; }) : null;
  const recipes = data.recipes.map(function(recipe) {
    return '<article class="recipe-card"><h3>' + escapeHtml(recipe.title) + '</h3><p><strong>' + escapeHtml(recipe.servings) + ' portions</strong></p><ul>' + escapeHtml(recipe.ingredients).split(',').map(function(item) { return '<li>' + item.trim() + '</li>'; }).join('') + '</ul><p>' + escapeHtml(recipe.method) + '</p><div class="card-actions"><button class="text-button" data-action="edit-recipe" data-id="' + recipe.id + '">Modifier</button><button class="text-button" data-action="delete-recipe" data-id="' + recipe.id + '">Supprimer</button></div></article>';
  }).join('') || empty('Aucune recette', 'Ajoutez votre première recette.');
  return heading('CUISINE', 'Cuisine', 'Recettes, fiches techniques et quantités pour vos repas.', '<button class="primary-button" data-action="new-recipe">Ajouter une recette</button>') +
    '<div class="two-columns"><div class="stack">' + card('Mes recettes', '<div class="card-body"><div class="recipe-grid">' + recipes + '</div></div>') + '</div><div class="stack">' +
      card(editing ? 'Modifier une recette' : 'Nouvelle recette', '<div class="card-body"><form id="recipe-form"><input type="hidden" name="id" value="' + (editing ? editing.id : '') + '"><div class="form-grid"><label class="field full">Nom<input required name="title" value="' + escapeHtml(editing ? editing.title : '') + '" placeholder="Ex. Curry de légumes"></label><label class="field">Portions<input required name="servings" type="number" min="1" value="' + escapeHtml(editing ? editing.servings : '2') + '"></label><label class="field full">Ingrédients<textarea required name="ingredients" placeholder="Séparez les ingrédients par une virgule.">' + escapeHtml(editing ? editing.ingredients : '') + '</textarea></label><label class="field full">Préparation<textarea required name="method">' + escapeHtml(editing ? editing.method : '') + '</textarea></label></div><div class="form-actions"><button class="primary-button" type="submit">' + (editing ? 'Enregistrer' : 'Créer la recette') + '</button>' + (editing ? '<button class="secondary-button" type="button" data-action="cancel-recipe">Annuler</button>' : '') + '</div></form></div>') +
      card('Produits de saison', '<div class="card-body"><p class="section-note">Consultez les fruits et légumes de saison auprès de sources locales. Cette section est prête à être reliée à une source de données quand vous le souhaiterez.</p></div>') +
    '</div></div>';
}

function renderMap() {
  const editing = ui.placeEditing ? data.places.find(function(place) { return place.id === ui.placeEditing; }) : null;
  const places = data.places.map(function(place) {
    const link = place.latitude && place.longitude ? 'https://www.openstreetmap.org/?mlat=' + encodeURIComponent(place.latitude) + '&mlon=' + encodeURIComponent(place.longitude) + '#map=16/' + encodeURIComponent(place.latitude) + '/' + encodeURIComponent(place.longitude) : '';
    return '<article class="place-card"><h3>' + escapeHtml(place.name) + '</h3><p><span class="badge category-badge">' + escapeHtml(place.category) + '</span></p><p>' + escapeHtml(place.address || 'Adresse non renseignée') + '</p><div class="card-actions">' + (link ? '<a class="text-button" target="_blank" rel="noreferrer" href="' + link + '">Voir sur OpenStreetMap</a>' : '') + '<button class="text-button" data-action="edit-place" data-id="' + place.id + '">Modifier</button><button class="text-button" data-action="delete-place" data-id="' + place.id + '">Supprimer</button></div></article>';
  }).join('') || empty('Aucun lieu', 'Enregistrez une adresse utile.');
  return heading('LIEUX', 'Carte', 'Gardez vos adresses favorites et ouvrez-les dans une carte interactive.', '<button class="primary-button" data-action="new-place">Ajouter un lieu</button>') +
    '<div class="two-columns"><div class="stack">' + card('Vos lieux enregistrés', '<div class="card-body"><div class="map-preview"><div><span class="quick-icon blue">🗺️</span><h2>Votre carte personnelle</h2><p>Ajoutez des coordonnées pour ouvrir n’importe quel lieu dans OpenStreetMap.</p></div></div><div class="place-grid" style="margin-top:14px">' + places + '</div></div>') + '</div><div class="stack">' +
      card(editing ? 'Modifier un lieu' : 'Ajouter un lieu', '<div class="card-body"><form id="place-form"><input type="hidden" name="id" value="' + (editing ? editing.id : '') + '"><div class="form-grid"><label class="field full">Nom<input required name="name" value="' + escapeHtml(editing ? editing.name : '') + '" placeholder="Ex. Restaurant préféré"></label><label class="field">Catégorie<input name="category" value="' + escapeHtml(editing ? editing.category : 'Favori') + '" placeholder="Ex. Restaurant"></label><label class="field full">Adresse<input name="address" value="' + escapeHtml(editing ? editing.address : '') + '" placeholder="Adresse du lieu"></label><label class="field">Latitude<input name="latitude" type="number" step="any" value="' + escapeHtml(editing ? editing.latitude : '') + '"></label><label class="field">Longitude<input name="longitude" type="number" step="any" value="' + escapeHtml(editing ? editing.longitude : '') + '"></label></div><div class="form-actions"><button class="primary-button" type="submit">' + (editing ? 'Enregistrer' : 'Ajouter le lieu') + '</button>' + (editing ? '<button class="secondary-button" type="button" data-action="cancel-place">Annuler</button>' : '') + '</div></form></div>') +
    '</div></div>';
}

function renderMail() {
  return heading('COMMUNICATIONS', 'Mails', 'Connectez vos boîtes mail lorsque le serveur de synchronisation sécurisé sera configuré.', '') +
    '<div class="stack">' +
      card('Boîtes mail', '<div class="card-body"><div class="integration"><span class="integration-icon">✉️</span><div><strong>Gmail</strong><p>Lecture, résumé IA et brouillons nécessitent une connexion OAuth sécurisée et une fonction serveur.</p></div><button class="secondary-button" data-action="integration-info">Configurer</button></div><div class="integration" style="margin-top:12px"><span class="integration-icon">☁️</span><div><strong>iCloud Mail</strong><p>La synchronisation demande une configuration serveur avec un mot de passe spécifique à l’application.</p></div><button class="secondary-button" data-action="integration-info">Configurer</button></div></div>') +
      card('Pourquoi cette étape est séparée ?', '<div class="card-body"><p class="section-note">Les identifiants de messagerie ne doivent jamais être ajoutés dans un fichier front-end ou dans GitHub. La prochaine étape devra créer un petit serveur sécurisé, puis demander votre autorisation pour connecter vos comptes.</p></div>') +
    '</div>';
}

function renderSettings() {
  const support = 'Notification' in window;
  const permission = support ? Notification.permission : 'non prise en charge';
  return heading('PRÉFÉRENCES', 'Paramètres', 'Gérez les notifications, vos données locales et les connexions futures.', '') +
    '<div class="two-columns"><div class="stack">' +
      card('Notifications', '<div class="card-body"><div class="settings-row"><span class="quick-icon violet">🔔</span><div class="item-main"><strong>Autorisation des notifications</strong><p>État actuel : ' + escapeHtml(permission) + '</p></div>' + (support ? '<button class="secondary-button" data-action="request-notifications">Autoriser</button>' : '') + '</div><form id="settings-form"><div class="settings-row"><span class="quick-icon blue">🌙</span><div class="item-main"><strong>Heures silencieuses</strong><p>Aucune notification pendant cette plage.</p></div><label class="field">De<input name="quietStart" type="time" value="' + escapeHtml(data.settings.quietStart) + '"></label><label class="field">À<input name="quietEnd" type="time" value="' + escapeHtml(data.settings.quietEnd) + '"></label></div><div class="form-actions"><button class="primary-button" type="submit">Enregistrer</button></div></form></div>') +
      card('PWA', '<div class="card-body"><p class="status ' + (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ? 'success' : 'info') + '">' + (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ? 'L’application est installée.' : 'L’application peut être installée depuis le menu du navigateur.') + '</p><p class="section-note" style="margin-top:12px">Les rappels peuvent maintenant être reçus même lorsque l’application est fermée. Sur iPhone, installez d’abord Mon assistant sur l’écran d’accueil puis activez les notifications ici.</p></div>') +
    '</div><div class="stack">' +
      card('Vos données', '<div class="card-body"><p class="section-note">Les tâches, courses, finances, calendrier, notes, recettes et lieux sont enregistrés dans le navigateur de cet appareil.</p><div class="form-actions"><button class="secondary-button" data-action="export-data">Exporter une sauvegarde</button><button class="danger-button" data-action="reset-data">Réinitialiser les données</button></div></div>') +
      card('Connexions externes', '<div class="card-body"><p class="section-note">Gmail, iCloud Mail et iCloud Calendar requièrent des intégrations OAuth ou serveur. Elles ne sont pas activées dans cette version locale afin de protéger vos comptes.</p></div>') +
    '</div></div>';
}

function render() {
  const current = pageId();
  renderNav(current);
  const view = {
    home: renderHome,
    tasks: renderTasks,
    shopping: renderShopping,
    finance: renderFinance,
    calendar: renderCalendar,
    assistant: renderAssistant,
    notes: renderNotes,
    cooking: renderCooking,
    map: renderMap,
    mail: renderMail,
    settings: renderSettings
  }[current];
  app.innerHTML = view();
}

function goTo(page) {
  location.hash = '#/' + page;
  closeMenu();
}

function removeFrom(listName, itemId) {
  data[listName] = data[listName].filter(function(item) { return item.id !== itemId; });
  save();
  render();
}

function editOrCreate(listName, values) {
  const existing = values.id ? data[listName].find(function(item) { return item.id === values.id; }) : null;
  if (existing) Object.assign(existing, values);
  else data[listName].push({ ...values, id: id(listName) });
  save();
  render();
}

function handleAssistant(message) {
  const input = String(message || '').trim();
  if (!input) return;
  ui.chat.push({ role: 'user', text: input });
  const lower = input.toLowerCase();
  if (lower.includes('combien') && lower.includes('tâche')) {
    ui.chat.push({ role: 'assistant', text: 'Il reste ' + data.tasks.filter(function(task) { return !task.done; }).length + ' tâche(s) à faire.' });
  } else if (lower.includes('finance') || lower.includes('solde') || lower.includes('argent')) {
    ui.chat.push({ role: 'assistant', text: 'Votre total général est de ' + money(totalBalance()) + '. Le Compte courant contient ' + money(accountById('current').balance) + ' et le Livret A ' + money(accountById('livret').balance) + '.' });
  } else if (lower.includes('événement') || lower.includes('agenda') || lower.includes('calendrier')) {
    const next = data.events.slice().sort(function(a, b) { return a.start.localeCompare(b.start); }).find(function(event) { return new Date(event.start) >= new Date(); });
    ui.chat.push({ role: 'assistant', text: next ? 'Le prochain événement est « ' + next.title + ' », ' + dateLabel(next.start, true) + '.' : 'Aucun événement à venir.' });
  } else if (lower.includes('course') && (lower.includes('ajoute') || lower.includes('ajouter'))) {
    const name = input.split(':').slice(1).join(':').trim() || 'Nouvel article';
    ui.pendingAction = { type: 'shopping', values: { name: name, quantity: '1', category: 'Autre', priority: 'Normale', done: false }, summary: 'Ajouter « ' + name + ' » à la liste de courses.' };
    ui.chat.push({ role: 'assistant', text: 'Je peux préparer cet ajout. Confirmez pour l’enregistrer.' });
  } else if (lower.includes('tâche') || lower.includes('tache')) {
    const name = input.split(':').slice(1).join(':').trim() || 'Nouvelle tâche';
    ui.pendingAction = { type: 'task', values: { title: name, priority: 'Normale', due: '', done: false }, summary: 'Ajouter la tâche « ' + name + ' ».' };
    ui.chat.push({ role: 'assistant', text: 'Je peux préparer cet ajout. Confirmez pour l’enregistrer.' });
  } else {
    ui.chat.push({ role: 'assistant', text: 'Je peux répondre sur vos tâches, courses, finances et agenda. Pour créer un élément, essayez par exemple : « Ajoute une tâche : appeler le médecin ».' });
  }
  render();
}

function submitForm(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  if (form.id === 'task-form') {
    editOrCreate('tasks', { id: values.id, title: values.title.trim(), priority: values.priority, due: values.due, done: ui.taskEditing ? data.tasks.find(function(task) { return task.id === values.id; }).done : false });
    ui.taskEditing = null;
    showToast('Tâche enregistrée.');
  }
  if (form.id === 'shopping-form') {
    editOrCreate('shopping', { id: values.id, name: values.name.trim(), quantity: values.quantity.trim() || '1', category: values.category, priority: values.priority, done: ui.shoppingEditing ? data.shopping.find(function(item) { return item.id === values.id; }).done : false });
    ui.shoppingEditing = null;
    showToast('Article enregistré.');
  }
  if (form.id === 'accounts-form') {
    const sum = data.accounts.reduce(function(total, account) { return total + Number(values['allocation-' + account.id] || 0); }, 0);
    if (Math.abs(sum - 100) > .01) {
      showToast('La répartition doit totaliser exactement 100 %.');
      return;
    }
    data.accounts.forEach(function(account) {
      account.balance = Number(values['balance-' + account.id] || 0);
      account.allocation = Number(values['allocation-' + account.id] || 0);
    });
    save();
    render();
    showToast('Comptes et répartitions enregistrés.');
  }
  if (form.id === 'money-form') {
    const account = accountById(values.accountId);
    const amount = Number(values.amount);
    if (!account || !amount || amount <= 0) return showToast('Indiquez un montant valide.');
    if (values.type === 'remove' && amount > account.balance) return showToast('Le retrait dépasse le solde du compte.');
    account.balance += values.type === 'add' ? amount : -amount;
    data.transactions.unshift({ id: id('transaction'), accountId: account.id, type: values.type, amount: amount, note: values.note.trim(), createdAt: new Date().toISOString() });
    save();
    render();
    showToast('Mouvement enregistré.');
  }
  if (form.id === 'goal-form') {
    data.goals.push({ id: id('goal'), name: values.name.trim(), target: Number(values.target), saved: 0 });
    save();
    render();
    showToast('Objectif créé.');
  }
  if (form.id === 'event-form') {
    if (new Date(values.end) < new Date(values.start)) return showToast('La fin doit être après le début.');
    editOrCreate('events', { id: values.id, title: values.title.trim(), start: values.start, end: values.end, category: values.category });
    ui.eventEditing = null;
    showToast('Événement enregistré.');
  }
  if (form.id === 'note-form') {
    editOrCreate('notes', { id: values.id, title: values.title.trim(), content: values.content.trim(), updatedAt: new Date().toISOString() });
    ui.noteEditing = null;
    showToast('Note enregistrée.');
  }
  if (form.id === 'recipe-form') {
    editOrCreate('recipes', { id: values.id, title: values.title.trim(), ingredients: values.ingredients.trim(), servings: values.servings, method: values.method.trim() });
    ui.recipeEditing = null;
    showToast('Recette enregistrée.');
  }
  if (form.id === 'place-form') {
    editOrCreate('places', { id: values.id, name: values.name.trim(), category: values.category.trim() || 'Favori', address: values.address.trim(), latitude: values.latitude.trim(), longitude: values.longitude.trim() });
    ui.placeEditing = null;
    showToast('Lieu enregistré.');
  }
  if (form.id === 'assistant-form') handleAssistant(values.message);
  if (form.id === 'settings-form') {
    data.settings.quietStart = values.quietStart;
    data.settings.quietEnd = values.quietEnd;
    save();
    showToast('Préférences enregistrées.');
  }
}

document.addEventListener('submit', function(event) {
  event.preventDefault();
  submitForm(event.target);
});

document.addEventListener('click', function(event) {
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) return goTo(pageButton.dataset.page);
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const itemId = button.dataset.id;
  if (action === 'toggle-task') {
    const task = data.tasks.find(function(item) { return item.id === itemId; });
    if (task) { task.done = !task.done; save(); render(); }
  }
  if (action === 'delete-task') removeFrom('tasks', itemId);
  if (action === 'edit-task') { ui.taskEditing = itemId; render(); }
  if (action === 'cancel-task') { ui.taskEditing = null; render(); }
  if (action === 'focus-task') { goTo('tasks'); setTimeout(function() { const field = document.querySelector('#task-title'); if (field) field.focus(); }, 0); }
  if (action === 'task-filter') { ui.taskFilter = button.dataset.filter; render(); }
  if (action === 'toggle-shopping') {
    const item = data.shopping.find(function(row) { return row.id === itemId; });
    if (item) { item.done = !item.done; save(); render(); }
  }
  if (action === 'delete-shopping') removeFrom('shopping', itemId);
  if (action === 'edit-shopping') { ui.shoppingEditing = itemId; render(); }
  if (action === 'cancel-shopping') { ui.shoppingEditing = null; render(); }
  if (action === 'focus-shopping') { goTo('shopping'); setTimeout(function() { const field = document.querySelector('#shopping-name'); if (field) field.focus(); }, 0); }
  if (action === 'shopping-filter') { ui.shoppingFilter = button.dataset.filter; render(); }
  if (action === 'focus-money') { goTo('finance'); setTimeout(function() { const field = document.querySelector('#money-amount'); if (field) field.focus(); }, 0); }
  if (action === 'delete-goal') { removeFrom('goals', itemId); }
  if (action === 'add-goal-savings') {
    const goal = data.goals.find(function(row) { return row.id === itemId; });
    const amount = Number(window.prompt('Montant à ajouter à cet objectif :', '0'));
    if (goal && amount > 0) { goal.saved += amount; save(); render(); showToast('Épargne ajoutée à l’objectif.'); }
  }
  if (action === 'calendar-prev' || action === 'calendar-next') {
    const direction = action === 'calendar-next' ? 1 : -1;
    if (ui.calendarView === 'month') ui.calendarDate.setMonth(ui.calendarDate.getMonth() + direction);
    else if (ui.calendarView === 'week') ui.calendarDate.setDate(ui.calendarDate.getDate() + direction * 7);
    else ui.calendarDate.setDate(ui.calendarDate.getDate() + direction);
    render();
  }
  if (action === 'calendar-today') { ui.calendarDate = new Date(); render(); }
  if (action === 'calendar-view') { ui.calendarView = button.dataset.view; render(); }
  if (action === 'new-event') { ui.eventEditing = null; goTo('calendar'); render(); }
  if (action === 'edit-event') { ui.eventEditing = itemId; goTo('calendar'); render(); }
  if (action === 'delete-event') { ui.eventEditing = null; removeFrom('events', itemId); }
  if (action === 'cancel-event') { ui.eventEditing = null; render(); }
  if (action === 'assistant-suggestion') handleAssistant(button.dataset.message);
  if (action === 'assistant-confirm' && ui.pendingAction) {
    if (ui.pendingAction.type === 'task') data.tasks.push({ ...ui.pendingAction.values, id: id('task') });
    if (ui.pendingAction.type === 'shopping') data.shopping.push({ ...ui.pendingAction.values, id: id('shopping') });
    save();
    ui.chat.push({ role: 'assistant', text: 'C’est enregistré.' });
    ui.pendingAction = null;
    render();
  }
  if (action === 'assistant-cancel') { ui.pendingAction = null; ui.chat.push({ role: 'assistant', text: 'Action annulée.' }); render(); }
  if (action === 'new-note') { ui.noteEditing = null; goTo('notes'); render(); }
  if (action === 'edit-note') { ui.noteEditing = itemId; render(); }
  if (action === 'delete-note') removeFrom('notes', itemId);
  if (action === 'cancel-note') { ui.noteEditing = null; render(); }
  if (action === 'new-recipe') { ui.recipeEditing = null; goTo('cooking'); render(); }
  if (action === 'edit-recipe') { ui.recipeEditing = itemId; render(); }
  if (action === 'delete-recipe') removeFrom('recipes', itemId);
  if (action === 'cancel-recipe') { ui.recipeEditing = null; render(); }
  if (action === 'new-place') { ui.placeEditing = null; goTo('map'); render(); }
  if (action === 'edit-place') { ui.placeEditing = itemId; render(); }
  if (action === 'delete-place') removeFrom('places', itemId);
  if (action === 'cancel-place') { ui.placeEditing = null; render(); }
  if (action === 'integration-info') showToast('Cette connexion demande d’abord un serveur sécurisé. Aucun compte n’est connecté.');
  if (action === 'request-notifications') {
    if (!('Notification' in window)) return showToast('Les notifications ne sont pas prises en charge ici.');
    Notification.requestPermission().then(function(permission) {
      data.settings.notifications = permission === 'granted';
      save();
      render();
      showToast(permission === 'granted' ? 'Notifications autorisées.' : 'Notifications non autorisées.');
    });
  }
  if (action === 'export-data') {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'mon-assistant-sauvegarde.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }
  if (action === 'reset-data') {
    if (window.confirm('Réinitialiser toutes les données locales ? Cette action est irréversible.')) {
      data = defaultData();
      save();
      render();
      showToast('Données réinitialisées.');
    }
  }
});

menu.addEventListener('click', function() {
  const opening = !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', opening);
  overlay.classList.toggle('visible', opening);
  menu.setAttribute('aria-expanded', String(opening));
});
overlay.addEventListener('click', closeMenu);
window.addEventListener('hashchange', render);
if ('serviceWorker' in navigator) window.addEventListener('load', function() { navigator.serviceWorker.register('./sw.js').catch(function() {}); });
render();
