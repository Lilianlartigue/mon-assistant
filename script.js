const pages = [
  ["home", "🏠", "Accueil"],
  ["assistant", "🤖", "Assistant IA"],
  ["calendar", "📅", "Calendrier"],
  ["tasks", "✓", "Tâches"],
  ["shopping", "🛒", "Courses"],
  ["finance", "💰", "Finances"],
  ["mail", "📧", "Mails"],
  ["map", "🗺️", "Carte"],
  ["notes", "📝", "Notes"],
  ["cooking", "👨‍🍳", "Cuisine"],
  ["settings", "⚙️", "Paramètres"]
];

const details = {
  assistant: ["Assistant IA", "Votre assistant personnel pourra bientôt organiser vos informations et répondre à vos questions.", "🤖"],
  calendar: ["Calendrier", "Planifiez vos journées et retrouvez vos prochains rendez-vous.", "📅"],
  tasks: ["Tâches", "Organisez tout ce que vous avez à faire, simplement.", "✓"],
  shopping: ["Courses", "Préparez vos listes et ne manquez plus rien en magasin.", "🛒"],
  finance: ["Finances", "Suivez vos comptes, vos objectifs et vos mouvements.", "💰"],
  mail: ["Mails", "Consultez et organisez votre boîte de réception.", "📧"],
  map: ["Carte", "Retrouvez vos lieux favoris et vos adresses utiles.", "🗺️"],
  notes: ["Notes", "Gardez vos idées, listes et informations importantes.", "📝"],
  cooking: ["Cuisine", "Centralisez vos recettes et vos inspirations culinaires.", "👨‍🍳"],
  settings: ["Paramètres", "Personnalisez votre espace et vos préférences.", "⚙️"]
};

const app = document.querySelector("#app");
const nav = document.querySelector("#sidebar-nav");
const sidebar = document.querySelector("#sidebar");
const overlay = document.querySelector("#overlay");
const menu = document.querySelector("#menu-button");

function pageId() {
  return location.hash.replace("#/", "") || "home";
}

function closeMenu() {
  sidebar.classList.remove("open");
  overlay.classList.remove("visible");
  menu.setAttribute("aria-expanded", "false");
}

function navigate(id) {
  location.hash = "#/" + id;
  closeMenu();
}

function renderNav(active) {
  nav.innerHTML = pages.map(([id, icon, label]) => `
    <button class="nav-button ${id === active ? "active" : ""}" data-page="${id}" type="button">
      <span class="nav-icon">${icon}</span>
      <span>${label}</span>
    </button>
  `).join("");
}

function dashboard() {
  const shortcuts = [
    ["tasks", "✓", "Tâches", "3 à faire", "color-violet"],
    ["calendar", "📅", "Calendrier", "2 événements", "color-blue"],
    ["shopping", "🛒", "Courses", "6 articles", "color-yellow"],
    ["finance", "💰", "Finances", "Voir mes comptes", "color-green"],
    ["notes", "📝", "Notes", "4 notes récentes", "color-pink"],
    ["cooking", "👨‍🍳", "Cuisine", "Mes recettes", "color-orange"]
  ];

  return `
    <div class="page-heading">
      <div>
        <p class="eyebrow">BONJOUR LILIANE</p>
        <h1>Votre journée en un coup d’œil</h1>
        <p>Voici ce qui mérite votre attention aujourd’hui.</p>
      </div>
      <button class="primary-button" data-page="assistant">Demander à l’IA</button>
    </div>

    <section class="quick-grid">
      ${shortcuts.map(([id, icon, title, subtitle, color]) => `
        <button class="quick-card" data-page="${id}">
          <span class="quick-icon ${color}">${icon}</span>
          <strong>${title}</strong>
          <small>${subtitle}</small>
        </button>
      `).join("")}
    </section>

    <section class="dashboard-grid" style="margin-top:21px">
      <article class="card">
        <div class="card-header">
          <h2>À faire aujourd’hui</h2>
          <button class="text-button" data-page="tasks">Tout voir</button>
        </div>
        <ul class="list">
          <li><span class="check"></span><span>Répondre aux messages importants</span><small>Important</small></li>
          <li><span class="check"></span><span>Faire les courses de la semaine</span><small>Normal</small></li>
          <li><span class="check"></span><span>Planifier le week-end</span><small>Faible</small></li>
        </ul>
      </article>

      <div class="side-stack">
        <article class="card">
          <div class="card-header">
            <h2>Prochain événement</h2>
            <button class="text-button" data-page="calendar">Agenda</button>
          </div>
          <ul class="list">
            <li>
              <span class="event-dot"></span>
              <span><strong>Déjeuner</strong><br><small style="margin:0">Aujourd’hui, 12:30</small></span>
            </li>
            <li>
              <span class="event-dot blue"></span>
              <span><strong>Appel</strong><br><small style="margin:0">Demain, 10:00</small></span>
            </li>
          </ul>
        </article>

        <article class="card">
          <div class="card-header">
            <h2>Vue financière</h2>
            <button class="text-button" data-page="finance">Détails</button>
          </div>
          <div class="balance">
            <strong>— €</strong>
            <p>Vos montants seront ajoutés ici.</p>
            <div class="progress"><span style="width:62%"></span></div>
          </div>
        </article>
      </div>
    </section>
  `;
}

function module(id) {
  const [title, description, icon] = details[id];

  return `
    <div class="page-heading">
      <div>
        <p class="eyebrow">MON ESPACE</p>
        <h1>${title}</h1>
        <p>${description}</p>
      </div>
      <button class="primary-button">Ajouter</button>
    </div>

    <section class="module-grid">
      <article class="card module-card">
        <span class="quick-icon color-violet">${icon}</span>
        <h2>Votre espace ${title.toLowerCase()}</h2>
        <p>Cette page est prête à accueillir les prochaines fonctionnalités.</p>
      </article>
    </section>

    <section class="card empty-state" style="margin-top:18px">
      <span class="quick-icon color-blue">${icon}</span>
      <h2>Rien à afficher pour le moment</h2>
      <p>Utilisez le bouton « Ajouter » pour commencer à organiser votre espace.</p>
      <button class="primary-button">Ajouter un élément</button>
    </section>
  `;
}

function render() {
  const id = pages.some(page => page[0] === pageId()) ? pageId() : "home";

  if (id !== pageId()) {
    history.replaceState(null, "", "#/home");
  }

  renderNav(id);
  app.innerHTML = id === "home" ? dashboard() : module(id);
  app.focus();
}

document.addEventListener("click", event => {
  const target = event.target.closest("[data-page]");
  if (target) navigate(target.dataset.page);
});

menu.addEventListener("click", () => {
  const open = !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", open);
  overlay.classList.toggle("visible", open);
  menu.setAttribute("aria-expanded", String(open));
});

overlay.addEventListener("click", closeMenu);
window.addEventListener("hashchange", render);

render();
