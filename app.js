const STORAGE_KEY = 'mon-assistant-data-v2';
const SUPABASE_URL = 'https://arnjwtcjesgxpdtjptmt.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_4-hMh1oMaJCu4Gz0-OlPSA_a3g3gj4N';

let cloudSyncTimer = null;
let isApplyingCloudData = false;

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
  ['portfolio', '📁', 'Portfolio'],
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
      { id: 'livret', name: 'Livret A', balance: 5400, allocation: 30, interestRate: 1.7 },
      { id: 'livret_jeune', name: 'Livret Jeune', balance: 0, allocation: 0, interestRate: 1.7 }
    ],
    transactions: [],
    goals: [{ id: id('goal'), name: 'Voyage', target: 1200, saved: 350 }],
    events: [
      { id: id('event'), title: 'Déjeuner', start: dayShift(0).slice(0, 11) + '12:30', end: dayShift(0).slice(0, 11) + '13:30', category: 'Personnel' },
      { id: id('event'), title: 'Appel', start: dayShift(1).slice(0, 11) + '10:00', end: dayShift(1).slice(0, 11) + '10:30', category: 'Travail' }
    ],
    notes: [{ id: id('note'), title: 'Bienvenue', content: 'Toutes vos données restent dans le navigateur de cet appareil.', updatedAt: new Date().toISOString() }],
    recipes: [{ id: id('recipe'), title: 'Pâtes tomate basilic', ingredients: 'Pâtes, tomates, basilic, parmesan', servings: 2, method: 'Cuire les pâtes puis mélanger avec la sauce tomate et le basilic.' }],
    portfolio: [],
    places: [{ id: id('place'), name: 'Maison', category: 'Favori', address: '', latitude: '', longitude: '' }],
    settings: { quietStart: '22:00', quietEnd: '08:00', notifications: false }
  };
}

function normalizeDataShape(input) {
  const source = input && typeof input === 'object' ? input : {};
  const base = defaultData();
  const next = { ...base, ...source };

  next.settings = {
    ...base.settings,
    ...(source.settings || {})
  };

  next.accounts = Array.isArray(source.accounts)
    ? source.accounts.map(function(account) { return { ...account }; })
    : base.accounts.map(function(account) { return { ...account }; });

  function ensureAccount(account) {
    const existing = next.accounts.find(function(item) { return item.id === account.id; });
    if (!existing) {
      next.accounts.push({ ...account });
      return;
    }
    if (existing.interestRate == null && account.interestRate != null) {
      existing.interestRate = account.interestRate;
    }
  }

  ensureAccount({ id: 'current', name: 'Compte courant', balance: 0, allocation: 0 });
  ensureAccount({ id: 'livret', name: 'Livret A', balance: 0, allocation: 0, interestRate: 1.7 });
  ensureAccount({ id: 'livret_jeune', name: 'Livret Jeune', balance: 0, allocation: 0, interestRate: 1.7 });

  if (!Array.isArray(next.portfolio)) next.portfolio = [];

  if (
    next.portfolio.length === 0 &&
    Array.isArray(source.recipes) &&
    source.recipes.length
  ) {
    next.portfolio = source.recipes.map(function(recipe) {
      return {
        id: 'portfolio-' + String(recipe.id || id('legacy')),
        title: recipe.title || 'Réalisation culinaire',
        category: 'Cuisine',
        description: recipe.ingredients
          ? 'Ingrédients : ' + recipe.ingredients
          : '',
        techniques: recipe.method || '',
        realizationDate: '',
        favorite: false
      };
    });
  }

  next.portfolio = next.portfolio.map(function(item) {
    return {
      id: item.id || id('portfolio'),
      title: item.title || item.name || 'Réalisation',
      category: item.category || 'Autre',
      description: item.description || '',
      techniques: item.techniques || '',
      realizationDate: item.realizationDate || item.realization_date || '',
      favorite: Boolean(item.favorite)
    };
  });

  return next;
}



function applyFinanceSnapshotMigration(value) {
  const next = value && typeof value === 'object' ? value : {};
  next.settings = {
    ...(next.settings || {})
  };

  const version = '2026-09-23-caisse-epargne-snapshot-v1';

  if (next.settings.financeSnapshotVersion === version) {
    return next;
  }

  if (!Array.isArray(next.accounts)) {
    next.accounts = [];
  }

  function ensure(idValue, name, balance, interestRate) {
    let account = next.accounts.find(function(item) {
      return item.id === idValue;
    });

    if (!account) {
      account = {
        id: idValue,
        name: name,
        balance: balance,
        allocation: 0
      };
      next.accounts.push(account);
    }

    account.name = name;
    account.balance = balance;

    if (interestRate != null) {
      account.interestRate = interestRate;
    }
  }

  ensure('current', 'Compte courant', 59.83, null);
  ensure('livret', 'Livret A', 5640.00, 1.7);
  ensure('livret_jeune', 'Livret Jeune', 1600.00, 3.0);

  next.settings.financeSnapshotVersion = version;

  return next;
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') return applyFinanceSnapshotMigration(normalizeDataShape(saved));
  } catch (error) {}
  return applyFinanceSnapshotMigration(normalizeDataShape(defaultData()));
}

function looksLikeDemoTasks(items) {
  if (!Array.isArray(items) || items.length !== 3) return false;
  const titles = items.map(function(item) { return item && item.title; }).sort();
  return JSON.stringify(titles) === JSON.stringify([
    'Faire les courses de la semaine',
    'Planifier le week-end',
    'Répondre aux messages importants'
  ].sort());
}

function looksLikeDemoShopping(items) {
  if (!Array.isArray(items) || items.length !== 2) return false;
  const names = items.map(function(item) { return item && item.name; }).sort();
  return JSON.stringify(names) === JSON.stringify([
    'Fruits de saison',
    'Lait'
  ].sort());
}

function looksLikeDemoRecipes(items) {
  return Array.isArray(items) &&
    items.length === 1 &&
    items[0] &&
    items[0].title === 'Pâtes tomate basilic';
}

function looksLikeDemoPlaces(items) {
  return Array.isArray(items) &&
    items.length === 1 &&
    items[0] &&
    items[0].name === 'Maison';
}

function supabaseHeaders(extra) {
  return Object.assign({
    apikey: SUPABASE_PUBLISHABLE_KEY,
    'Content-Type': 'application/json'
  }, extra || {});
}

async function supabaseRequest(path, options) {
  const response = await fetch(
    SUPABASE_URL + '/rest/v1/' + path,
    Object.assign({ headers: supabaseHeaders() }, options || {})
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || 'Erreur Supabase ' + response.status);
  }

  return text ? JSON.parse(text) : null;
}

async function syncCloudData() {
  if (isApplyingCloudData) return;

  try {
    await supabaseRequest('finances?on_conflict=id', {
      method: 'POST',
      headers: supabaseHeaders({
        Prefer: 'resolution=merge-duplicates,return=minimal'
      }),
      body: JSON.stringify({
        id: 'main',
        data: data,
        updated_at: new Date().toISOString()
      })
    });
  } catch (error) {
    console.error('Synchronisation Supabase :', error);
  }
}

function scheduleCloudSync() {
  if (isApplyingCloudData) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(syncCloudData, 700);
}

async function loadCloudData() {
  try {
    const results = await Promise.all([
      supabaseRequest(
        'finances?id=eq.main&select=id,data,updated_at&limit=1'
      ),
      supabaseRequest(
        'portfolio?select=id,name,title,category,description,techniques,realization_date,favorite&order=id.asc'
      ).catch(function () { return []; })
    ]);

    const rows = results[0] || [];
    const legacyPortfolio = results[1] || [];

    if (!rows || !rows[0] || !rows[0].data) {
      await syncCloudData();
      return;
    }

    const localData = data;
    const remoteData = rows[0].data;

    isApplyingCloudData = true;

    const merged = applyFinanceSnapshotMigration(normalizeDataShape({
      ...defaultData(),
      ...localData,
      ...remoteData
    }));

    if (
      (!Array.isArray(remoteData.portfolio) || remoteData.portfolio.length === 0) &&
      legacyPortfolio.length
    ) {
      merged.portfolio = legacyPortfolio.map(function(item) {
        return {
          id: 'portfolio-' + String(item.id),
          title: item.title || item.name || 'Réalisation',
          category: item.category || 'Autre',
          description: item.description || '',
          techniques: item.techniques || '',
          realizationDate: item.realization_date || '',
          favorite: Boolean(item.favorite)
        };
      });
    }

    if (!Array.isArray(remoteData.tasks) && looksLikeDemoTasks(localData.tasks)) {
      merged.tasks = [];
    }

    if (!Array.isArray(remoteData.shopping) && looksLikeDemoShopping(localData.shopping)) {
      merged.shopping = [];
    }

    if (!Array.isArray(remoteData.recipes) && looksLikeDemoRecipes(localData.recipes)) {
      merged.recipes = [];
    }

    if (!Array.isArray(remoteData.places) && looksLikeDemoPlaces(localData.places)) {
      merged.places = [];
    }

    data = merged;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(data)
    );

    isApplyingCloudData = false;

    render();

    await syncCloudData();

  } catch (error) {
    isApplyingCloudData = false;
    console.error('Chargement Supabase :', error);
    showToast('Les données en ligne n’ont pas pu être chargées.');
  }
}

let data = loadData();
let ui = {
  taskFilter: 'Toutes',
  shoppingFilter: 'Toutes',
  calendarDate: new Date(),
  calendarView: 'month',
  eventEditing: null,
  noteEditing: null,
  portfolioEditing: null,
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
  scheduleCloudSync();
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
  let page = location.hash.replace('#/', '') || 'home';
  if (page === 'cooking') page = 'portfolio';
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


function estimatedAnnualInterest(account) {
  if (!account) return 0;
  return Number(account.balance || 0) * Number(account.interestRate || 0) / 100;
}

function normalizeMatch(value) {
  return String(value || '').trim().toLocaleLowerCase('fr-FR');
}

function findCollectionItem(collection, match, values) {
  const list = data[collection];
  if (!Array.isArray(list)) return null;
  const wanted = normalizeMatch(match || values?.id || values?.name || values?.title);
  if (!wanted) return null;
  return list.find(function(item) {
    return [
      item.id,
      item.name,
      item.title
    ].some(function(value) {
      return normalizeMatch(value) === wanted;
    });
  }) || null;
}

function resolveFinanceAccount(reference) {
  if (!reference) return null;
  return accountById(String(reference)) ||
    findCollectionItem('accounts', String(reference), {});
}

function normalizeTransactionValues(values) {
  const v = values && typeof values === 'object' ? values : {};
  const type = ['add', 'remove', 'transfer'].includes(v.type) ? v.type : 'add';
  const amount = Number(v.amount || 0);

  if (type === 'transfer') {
    const from = resolveFinanceAccount(v.fromAccountId || v.fromAccount);
    const to = resolveFinanceAccount(v.toAccountId || v.toAccount);

    if (!from || !to || from.id === to.id || amount <= 0) return null;

    return {
      id: v.id || id('transaction'),
      type: 'transfer',
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: amount,
      note: String(v.note || v.description || 'Virement interne').trim(),
      createdAt: v.createdAt || new Date().toISOString()
    };
  }

  const account = resolveFinanceAccount(v.accountId || v.account);
  if (!account || amount <= 0) return null;

  return {
    id: v.id || id('transaction'),
    accountId: account.id,
    type: type,
    amount: amount,
    note: String(v.note || v.description || '').trim(),
    createdAt: v.createdAt || new Date().toISOString()
  };
}

function canApplyTransaction(transaction, direction) {
  const amount = Number(transaction.amount || 0);
  if (amount <= 0) return false;

  if (transaction.type === 'add') {
    const account = accountById(transaction.accountId);
    return Boolean(account) &&
      (direction > 0 || Number(account.balance || 0) >= amount);
  }

  if (transaction.type === 'remove') {
    const account = accountById(transaction.accountId);
    return Boolean(account) &&
      (direction < 0 || Number(account.balance || 0) >= amount);
  }

  if (transaction.type === 'transfer') {
    const from = accountById(transaction.fromAccountId);
    const to = accountById(transaction.toAccountId);
    if (!from || !to || from.id === to.id) return false;

    return direction > 0
      ? Number(from.balance || 0) >= amount
      : Number(to.balance || 0) >= amount;
  }

  return false;
}

function applyTransactionBalance(transaction, direction) {
  const factor = direction >= 0 ? 1 : -1;
  const amount = Number(transaction.amount || 0);

  if (!canApplyTransaction(transaction, factor)) return false;

  if (transaction.type === 'add') {
    const account = accountById(transaction.accountId);
    account.balance = Number(account.balance || 0) + factor * amount;
    return true;
  }

  if (transaction.type === 'remove') {
    const account = accountById(transaction.accountId);
    account.balance = Number(account.balance || 0) - factor * amount;
    return true;
  }

  if (transaction.type === 'transfer') {
    const from = accountById(transaction.fromAccountId);
    const to = accountById(transaction.toAccountId);
    from.balance = Number(from.balance || 0) - factor * amount;
    to.balance = Number(to.balance || 0) + factor * amount;
    return true;
  }

  return false;
}

function addFinanceTransaction(values) {
  const transaction = normalizeTransactionValues(values);
  if (!transaction) return false;
  if (!applyTransactionBalance(transaction, 1)) return false;
  data.transactions.unshift(transaction);
  return true;
}


function createAssistantItem(collection, values) {
  const v = values && typeof values === 'object' ? { ...values } : {};

  if (collection === 'tasks') {
    data.tasks.push({
      id: id('task'),
      title: String(v.title || v.name || 'Nouvelle tâche').trim(),
      priority: v.priority || 'Normale',
      due: v.due || '',
      done: Boolean(v.done)
    });
    return true;
  }

  if (collection === 'shopping') {
    data.shopping.push({
      id: id('shopping'),
      name: String(v.name || v.title || 'Nouvel article').trim(),
      quantity: String(v.quantity || '1'),
      category: v.category || 'Autre',
      priority: v.priority || 'Normale',
      done: Boolean(v.done)
    });
    return true;
  }

  if (collection === 'accounts') {
    data.accounts.push({
      id: v.id || id('account'),
      name: String(v.name || 'Nouveau compte').trim(),
      balance: Number(v.balance || 0),
      allocation: Number(v.allocation || 0),
      interestRate: v.interestRate == null ? undefined : Number(v.interestRate)
    });
    return true;
  }

  if (collection === 'transactions') {
    return addFinanceTransaction(v);
  }

  if (collection === 'goals') {
    data.goals.push({
      id: id('goal'),
      name: String(v.name || v.title || 'Nouvel objectif').trim(),
      target: Number(v.target || 0),
      saved: Number(v.saved || 0)
    });
    return true;
  }

  if (collection === 'events') {
    data.events.push({
      id: id('event'),
      title: String(v.title || v.name || 'Nouvel événement').trim(),
      start: v.start || v.startAt || dayShift(0),
      end: v.end || v.endAt || v.start || v.startAt || dayShift(0),
      category: v.category || 'Personnel'
    });
    return true;
  }

  if (collection === 'notes') {
    data.notes.push({
      id: id('note'),
      title: String(v.title || v.name || 'Nouvelle note').trim(),
      content: String(v.content || v.description || '').trim(),
      updatedAt: new Date().toISOString()
    });
    return true;
  }

  if (collection === 'portfolio') {
    data.portfolio.push({
      id: id('portfolio'),
      title: String(v.title || v.name || 'Nouvelle réalisation').trim(),
      category: v.category || 'Autre',
      description: String(v.description || '').trim(),
      techniques: String(v.techniques || '').trim(),
      realizationDate: v.realizationDate || v.date || '',
      favorite: Boolean(v.favorite)
    });
    return true;
  }

  if (collection === 'places') {
    data.places.push({
      id: id('place'),
      name: String(v.name || v.title || 'Nouveau lieu').trim(),
      category: v.category || 'Favori',
      address: String(v.address || '').trim(),
      latitude: v.latitude == null ? '' : String(v.latitude),
      longitude: v.longitude == null ? '' : String(v.longitude)
    });
    return true;
  }

  return false;
}

function applyAssistantAction(action) {
  if (!action || !action.operation || !action.collection) return false;

  const operation = String(action.operation);
  const collection = String(action.collection);
  const values = action.values && typeof action.values === 'object' ? action.values : {};

  const allowed = ['tasks','shopping','accounts','transactions','goals','events','notes','portfolio','places','settings'];
  if (!allowed.includes(collection)) return false;

  if (collection === 'settings') {
    if (operation === 'update') {
      data.settings = { ...data.settings, ...values };
      return true;
    }
    return false;
  }

  if (operation === 'create') {
    return createAssistantItem(collection, values);
  }

  const item = findCollectionItem(collection, action.match, values);
  if (!item) return false;

  if (operation === 'update') {
    if (collection === 'transactions') {
      const original = { ...item };

      if (!applyTransactionBalance(original, -1)) {
        return false;
      }

      const updated = normalizeTransactionValues({
        ...original,
        ...values,
        id: original.id,
        createdAt: original.createdAt
      });

      if (!updated || !applyTransactionBalance(updated, 1)) {
        applyTransactionBalance(original, 1);
        return false;
      }

      Object.keys(item).forEach(function(key) {
        delete item[key];
      });
      Object.assign(item, updated);
      return true;
    }

    Object.assign(item, values);

    if (collection === 'notes') item.updatedAt = new Date().toISOString();
    if (collection === 'accounts' && item.interestRate != null) item.interestRate = Number(item.interestRate);
    return true;
  }

  if (operation === 'delete') {
    if (collection === 'accounts' && ['current','livret','livret_jeune'].includes(item.id)) {
      return false;
    }

    if (collection === 'transactions') {
      if (!applyTransactionBalance(item, -1)) {
        return false;
      }
    }

    data[collection] = data[collection].filter(function(row) { return row.id !== item.id; });
    return true;
  }

  return false;
}

function applyAssistantActions(actions) {
  const list = Array.isArray(actions) ? actions.slice(0, 10) : [];
  let applied = 0;
  list.forEach(function(action) {
    if (applyAssistantAction(action)) applied += 1;
  });
  if (applied) save();
  return applied;
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
    ['portfolio', '📁', 'Portfolio', data.portfolio.length + ' réalisation(s)', 'orange']
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

  const savingsAccounts = data.accounts.filter(function(account) {
    return account.id === 'livret' || account.id === 'livret_jeune';
  });

  const interestRows = savingsAccounts.map(function(account) {
    return '<div class="interest-row"><div><strong>' + escapeHtml(account.name) + '</strong><p>Estimation annuelle si le solde reste inchangé.</p></div><label class="field">Taux annuel<input name="rate-' + account.id + '" type="number" min="0" step="0.01" value="' + Number(account.interestRate || 0) + '"></label><div class="interest-value"><small>Intérêts estimés</small><strong>' + money(estimatedAnnualInterest(account)) + '</strong></div></div>';
  }).join('');

  const transactions = data.transactions.slice(0, 12).map(function(transaction) {
    if (transaction.type === 'transfer') {
      const from = accountById(transaction.fromAccountId);
      const to = accountById(transaction.toAccountId);

      return '<div class="transaction"><span class="transaction-icon transaction-transfer">↔</span><div class="transaction-main"><strong>' + escapeHtml(transaction.note || 'Virement interne') + '</strong><br><small>' + escapeHtml(from ? from.name : 'Compte source') + ' → ' + escapeHtml(to ? to.name : 'Compte destination') + ' · ' + dateLabel(transaction.createdAt, true) + '</small></div><strong class="transfer-amount">' + money(transaction.amount) + '</strong></div>';
    }

    const account = accountById(transaction.accountId);
    return '<div class="transaction"><span class="transaction-icon ' + (transaction.type === 'add' ? 'transaction-in' : 'transaction-out') + '">' + (transaction.type === 'add' ? '+' : '−') + '</span><div class="transaction-main"><strong>' + escapeHtml(transaction.note || (transaction.type === 'add' ? 'Ajout d’argent' : 'Retrait d’argent')) + '</strong><br><small>' + escapeHtml(account ? account.name : '') + ' · ' + dateLabel(transaction.createdAt, true) + '</small></div><strong class="' + (transaction.type === 'add' ? 'positive' : 'negative') + '">' + (transaction.type === 'add' ? '+' : '−') + money(transaction.amount) + '</strong></div>';
  }).join('') || empty('Aucun mouvement', 'Vos ajouts, retraits et virements apparaîtront ici.');

  const goals = data.goals.map(function(goal) {
    const percent = goal.target ? Math.min(100, Math.round((goal.saved / goal.target) * 100)) : 0;
    return '<div class="goal"><div class="goal-line"><strong>' + escapeHtml(goal.name) + '</strong><span>' + money(goal.saved) + ' / ' + money(goal.target) + '</span></div><div class="progress"><span style="width:' + percent + '%"></span></div><div class="card-actions"><button class="text-button" data-action="add-goal-savings" data-id="' + goal.id + '">Ajouter une épargne</button><button class="text-button" data-action="delete-goal" data-id="' + goal.id + '">Supprimer</button></div></div>';
  }).join('') || empty('Aucun objectif', 'Créez un objectif financier.');

  return heading('BUDGET', 'Finances', 'Gérez vos comptes, vos répartitions, vos intérêts et vos objectifs.', '<button class="primary-button" data-action="focus-money">Ajouter un mouvement</button>') +
    '<div class="three-columns finance-summary"><section class="card stat-card"><p>Total général</p><strong class="money">' + money(totalBalance()) + '</strong></section>' +
    data.accounts.map(function(account) {
      return '<section class="card stat-card"><p>' + escapeHtml(account.name) + '</p><strong class="money">' + money(account.balance) + '</strong>' + ((account.id === 'livret' || account.id === 'livret_jeune') ? '<small>' + Number(account.interestRate || 0).toLocaleString('fr-FR') + ' % · ' + money(estimatedAnnualInterest(account)) + '/an estimés</small>' : '') + '</section>';
    }).join('') + '</div>' +
    '<div class="two-columns" style="margin-top:21px"><div class="stack">' +
      card('Comptes et répartitions', '<div class="card-body"><form id="accounts-form">' + accountFields + '<p class="allocation-total ' + (allocationOk ? '' : 'invalid') + '">Répartition totale : ' + number(allocation) + ' %' + (allocationOk ? ' ✓' : ' — elle doit faire 100 %.') + '</p><div class="form-actions"><button class="primary-button" type="submit">Enregistrer les comptes</button></div></form></div>') +
      card('Intérêts des livrets', '<div class="card-body"><form id="interest-form">' + interestRows + '<p class="section-note">Le calcul affiché est une estimation simple sur le solde actuel. Les intérêts réglementés sont réellement calculés selon les règles du livret.</p><div class="form-actions"><button class="secondary-button" type="submit">Enregistrer les taux</button></div></form></div>') +
      card('Historique des mouvements', '<div class="card-body">' + transactions + '</div>') +
    '</div><div class="stack">' +
      card('Ajouter ou retirer de l’argent', '<div class="card-body"><form id="money-form"><div class="form-grid"><label class="field">Opération<select name="type"><option value="add">Ajouter de l’argent</option><option value="remove">Retirer de l’argent</option></select></label><label class="field">Compte<select name="accountId">' + data.accounts.map(function(account) { return '<option value="' + account.id + '">' + escapeHtml(account.name) + '</option>'; }).join('') + '</select></label><label class="field">Montant<input id="money-amount" required name="amount" type="number" min="0.01" step="0.01" placeholder="0,00"></label><label class="field">Motif<select name="note"><option value="Alimentation">Alimentation</option><option value="Restaurant / café">Restaurant / café</option><option value="Transport">Transport</option><option value="Carburant">Carburant</option><option value="Logement">Logement</option><option value="Abonnements">Abonnements</option><option value="Téléphone / Internet">Téléphone / Internet</option><option value="Santé">Santé</option><option value="Études / Lycée">Études / Lycée</option><option value="Loisirs">Loisirs</option><option value="Shopping">Shopping</option><option value="Cadeaux">Cadeaux</option><option value="Frais bancaires">Frais bancaires</option><option value="Retrait espèces">Retrait espèces</option><option value="Virement">Virement</option><option value="Épargne">Épargne</option><option value="Salaire / revenu">Salaire / revenu</option><option value="Remboursement">Remboursement</option><option value="Autre">Autre</option></select></label></div><div class="form-actions"><button class="primary-button" type="submit">Enregistrer le mouvement</button></div></form></div>') +
      card('Virement interne', '<div class="card-body"><form id="transfer-form"><div class="form-grid"><label class="field">Depuis<select name="fromAccountId">' + data.accounts.map(function(account) { return '<option value="' + account.id + '">' + escapeHtml(account.name) + ' · ' + money(account.balance) + '</option>'; }).join('') + '</select></label><label class="field">Vers<select name="toAccountId">' + data.accounts.map(function(account, index) { return '<option value="' + account.id + '" ' + (index === 1 ? 'selected' : '') + '>' + escapeHtml(account.name) + ' · ' + money(account.balance) + '</option>'; }).join('') + '</select></label><label class="field">Montant<input required name="amount" type="number" min="0.01" step="0.01" placeholder="0,00"></label><label class="field">Motif<select name="note"><option>Épargne</option><option>Rééquilibrage</option><option>Virement interne</option><option>Autre</option></select></label></div><p class="section-note" style="margin-top:10px">Le total général ne change pas : l’argent passe simplement d’un de tes comptes à un autre.</p><div class="form-actions"><button class="primary-button" type="submit">Effectuer le virement</button></div></form></div>') +
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
  const conversation = ui.chat.map(function(message) {
    return '<div class="message ' + message.role + '">' + escapeHtml(message.text) + '</div>';
  }).join('');

  const confirmation = ui.pendingAction
    ? '<div class="confirm-box"><p><strong>Confirmation requise</strong><br>' + escapeHtml(ui.pendingAction.summary) + '</p><button class="primary-button" data-action="assistant-confirm">Confirmer</button> <button class="secondary-button" data-action="assistant-cancel">Annuler</button></div>'
    : '';

  return heading('ASSISTANT PERSONNEL', 'Assistant IA', 'Il peut consulter toutes les données du tableau de bord et préparer des créations, modifications ou suppressions. Toute action attend ta confirmation.', '') +
    '<div class="two-columns"><div class="stack">' +
      card('Conversation', '<div class="assistant-chat">' + conversation + confirmation + '</div><form id="assistant-form" class="assistant-composer"><input required name="message" placeholder="Ex. Mets 50 € sur le Livret Jeune"><button class="primary-button" type="submit">Envoyer</button></form><div class="suggestions"><button class="suggestion" data-action="assistant-suggestion" data-message="Fais-moi le point sur ma journée">Ma journée</button><button class="suggestion" data-action="assistant-suggestion" data-message="Quel est mon total financier et mes intérêts estimés ?">Mes finances</button><button class="suggestion" data-action="assistant-suggestion" data-message="Quels sont mes prochains événements ?">Mon agenda</button><button class="suggestion" data-action="assistant-suggestion" data-message="Ajoute une note intitulée Idées et écris penser au dessert">Ajouter une note</button></div>') +
    '</div><div class="stack">' +
      card('Données accessibles', '<div class="card-body"><p class="section-note">✓ Tâches et courses<br><br>✓ Comptes, mouvements, objectifs et taux d’intérêt<br><br>✓ Calendrier<br><br>✓ Notes<br><br>✓ Portfolio<br><br>✓ Lieux et paramètres<br><br>◌ Mails : disponibles dès qu’une boîte mail est réellement connectée.</p></div>') +
      card('Actions', '<div class="card-body"><p class="section-note">L’IA peut créer, modifier et supprimer les éléments du tableau de bord après confirmation. Les comptes système indispensables ne peuvent pas être supprimés pour éviter de casser les finances.</p></div>') +
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

function renderPortfolio() {
  const editing = ui.portfolioEditing
    ? data.portfolio.find(function(item) { return item.id === ui.portfolioEditing; })
    : null;

  const categoriesPortfolio = ['Cuisine', 'Dessert', 'Pâtisserie', 'Boulangerie', 'Technique', 'Stage', 'Autre'];

  const cards = data.portfolio
    .slice()
    .sort(function(a, b) {
      return Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) ||
        String(b.realizationDate || '').localeCompare(String(a.realizationDate || ''));
    })
    .map(function(item) {
      return '<article class="portfolio-card">' +
        '<div class="portfolio-card-head"><span class="badge category-badge">' + escapeHtml(item.category) + '</span>' + (item.favorite ? '<span class="portfolio-favorite">★</span>' : '') + '</div>' +
        '<h3>' + escapeHtml(item.title) + '</h3>' +
        (item.realizationDate ? '<small>' + dateLabel(item.realizationDate) + '</small>' : '') +
        (item.description ? '<p>' + escapeHtml(item.description).replace(/\n/g, '<br>') + '</p>' : '') +
        (item.techniques ? '<p><strong>Techniques :</strong> ' + escapeHtml(item.techniques) + '</p>' : '') +
        '<div class="card-actions"><button class="text-button" data-action="edit-portfolio" data-id="' + item.id + '">Modifier</button><button class="text-button" data-action="delete-portfolio" data-id="' + item.id + '">Supprimer</button></div>' +
      '</article>';
    }).join('') || empty('Portfolio vide', 'Ajoute une réalisation, un dessert, une technique ou un projet.');

  return heading('RÉALISATIONS', 'Portfolio', 'Garde une trace de tes réalisations, techniques, stages et créations culinaires.', '<button class="primary-button" data-action="new-portfolio">Ajouter une réalisation</button>') +
    '<div class="two-columns"><div class="stack">' +
      card('Mes réalisations', '<div class="card-body"><div class="portfolio-grid">' + cards + '</div></div>') +
    '</div><div class="stack">' +
      card(editing ? 'Modifier la réalisation' : 'Nouvelle réalisation', '<div class="card-body"><form id="portfolio-form"><input type="hidden" name="id" value="' + (editing ? editing.id : '') + '"><div class="form-grid"><label class="field full">Titre<input required name="title" value="' + escapeHtml(editing ? editing.title : '') + '" placeholder="Ex. Dessert pêche-verveine"></label><label class="field">Catégorie<select name="category">' + categoriesPortfolio.map(function(category) { return '<option ' + ((editing ? editing.category : 'Cuisine') === category ? 'selected' : '') + '>' + category + '</option>'; }).join('') + '</select></label><label class="field">Date<input name="realizationDate" type="date" value="' + escapeHtml(editing ? editing.realizationDate : '') + '"></label><label class="field full">Description<textarea name="description" placeholder="Contexte, composition, résultat…">' + escapeHtml(editing ? editing.description : '') + '</textarea></label><label class="field full">Techniques<textarea name="techniques" placeholder="Cuissons, sauces, montages, dressage…">' + escapeHtml(editing ? editing.techniques : '') + '</textarea></label><label class="field full portfolio-check"><input name="favorite" type="checkbox" ' + (editing && editing.favorite ? 'checked' : '') + '> Mettre en favori</label></div><div class="form-actions"><button class="primary-button" type="submit">' + (editing ? 'Enregistrer' : 'Ajouter au portfolio') + '</button>' + (editing ? '<button class="secondary-button" type="button" data-action="cancel-portfolio">Annuler</button>' : '') + '</div></form></div>') +
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
      card('Notifications personnalisées', '<div class="card-body"><div class="settings-row"><span class="quick-icon violet">🔔</span><div class="item-main"><strong>Notifications de ta journée</strong><p>État actuel : ' + escapeHtml(permission) + '</p></div>' + (support ? '<div class="form-actions"><button class="secondary-button" data-action="request-notifications">Activer</button><button class="secondary-button" data-action="test-notification">Tester maintenant</button></div>' : '') + '</div><p class="section-note" style="margin:12px 0 16px">Le contenu est construit avec tes tâches, ton calendrier et tes courses. Trois points sont prévus vers 8 h, 13 h et 19 h.</p><form id="settings-form"><div class="settings-row"><span class="quick-icon blue">🌙</span><div class="item-main"><strong>Heures silencieuses</strong><p>Aucune notification pendant cette plage.</p></div><label class="field">De<input name="quietStart" type="time" value="' + escapeHtml(data.settings.quietStart) + '"></label><label class="field">À<input name="quietEnd" type="time" value="' + escapeHtml(data.settings.quietEnd) + '"></label></div><div class="form-actions"><button class="primary-button" type="submit">Enregistrer</button></div></form></div>') +
      card('PWA', '<div class="card-body"><p class="status ' + (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ? 'success' : 'info') + '">' + (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ? 'L’application est installée.' : 'L’application peut être installée depuis le menu du navigateur.') + '</p><p class="section-note" style="margin-top:12px">Les notifications Web Push peuvent arriver même lorsque Mon assistant est fermé. Sur iPhone, utilise l’application ajoutée à l’écran d’accueil.</p></div>') +
    '</div><div class="stack">' +
      card('Vos données', '<div class="card-body"><p class="section-note">Les tâches, courses, finances, calendrier, notes, portfolio et lieux sont synchronisés avec ton espace Mon assistant.</p><div class="form-actions"><button class="secondary-button" data-action="export-data">Exporter une sauvegarde</button><button class="danger-button" data-action="reset-data">Réinitialiser les données</button></div></div>') +
      card('Connexions externes', '<div class="card-body"><p class="section-note">Les connexions externes sont gérées séparément afin de protéger tes comptes.</p></div>') +
    '</div></div>';
}

function render() {
  const current = pageId();
  document.body.dataset.page = current;
  renderNav(current);
  const view = {
    home: renderHome,
    tasks: renderTasks,
    shopping: renderShopping,
    finance: renderFinance,
    calendar: renderCalendar,
    assistant: renderAssistant,
    notes: renderNotes,
    portfolio: renderPortfolio,
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
  if (form.id === 'interest-form') {
    const livretA = accountById('livret');
    const livretJeune = accountById('livret_jeune');

    if (livretA) {
      livretA.interestRate = Math.max(
        0,
        Number(values['rate-livret'] || 0)
      );
    }

    if (livretJeune) {
      livretJeune.interestRate = Math.max(
        Number(livretA ? livretA.interestRate : 0),
        Number(values['rate-livret_jeune'] || 0)
      );
    }

    save();
    render();
    showToast('Taux d’intérêt enregistrés.');
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
    const ok = addFinanceTransaction({
      accountId: values.accountId,
      type: values.type,
      amount: Number(values.amount),
      note: values.note
    });

    if (!ok) {
      return showToast('Impossible d’enregistrer ce mouvement. Vérifie le compte et le solde.');
    }

    save();
    render();
    showToast('Mouvement enregistré.');
  }

  if (form.id === 'transfer-form') {
    if (values.fromAccountId === values.toAccountId) {
      return showToast('Choisis deux comptes différents.');
    }

    const ok = addFinanceTransaction({
      type: 'transfer',
      fromAccountId: values.fromAccountId,
      toAccountId: values.toAccountId,
      amount: Number(values.amount),
      note: values.note
    });

    if (!ok) {
      return showToast('Virement impossible. Vérifie le montant et le solde du compte de départ.');
    }

    save();
    render();
    showToast('Virement interne effectué.');
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
  if (form.id === 'portfolio-form') {
    editOrCreate('portfolio', {
      id: values.id,
      title: values.title.trim(),
      category: values.category,
      description: values.description.trim(),
      techniques: values.techniques.trim(),
      realizationDate: values.realizationDate,
      favorite: values.favorite === 'on'
    });
    ui.portfolioEditing = null;
    showToast('Portfolio enregistré.');
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
    const count = applyAssistantActions(ui.pendingAction.actions || []);
    ui.chat.push({
      role: 'assistant',
      text: count
        ? (count === 1 ? 'C’est fait.' : count + ' actions ont été effectuées.')
        : 'Je n’ai pas pu appliquer cette action sans risquer d’endommager les données.'
    });
    ui.pendingAction = null;
    render();
  }
  if (action === 'assistant-cancel') { ui.pendingAction = null; ui.chat.push({ role: 'assistant', text: 'Action annulée.' }); render(); }
  if (action === 'new-note') { ui.noteEditing = null; goTo('notes'); render(); }
  if (action === 'edit-note') { ui.noteEditing = itemId; render(); }
  if (action === 'delete-note') removeFrom('notes', itemId);
  if (action === 'cancel-note') { ui.noteEditing = null; render(); }
  if (action === 'new-portfolio') { ui.portfolioEditing = null; goTo('portfolio'); render(); }
  if (action === 'edit-portfolio') { ui.portfolioEditing = itemId; render(); }
  if (action === 'delete-portfolio') removeFrom('portfolio', itemId);
  if (action === 'cancel-portfolio') { ui.portfolioEditing = null; render(); }
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
loadCloudData();
