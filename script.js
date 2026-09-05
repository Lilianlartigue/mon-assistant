/* =====================================================
   CONFIGURATION SUPABASE
===================================================== */

const SUPABASE_URL =
  "https://arnjwtcjesgxpdtjptmt.supabase.co";


const SUPABASE_KEY =
  "sb_publishable_4-hMh1oMaJCu4Gz0-OlPSA_a3g3gj4N";


const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );


/* =====================================================
   SECURITE HTML
===================================================== */

function escapeHtml(text) {

  const div =
    document.createElement("div");


  div.textContent =
    text == null
      ? ""
      : String(text);


  return div.innerHTML;

}


/* =====================================================
   METEO
===================================================== */

async function loadWeather() {

  const weatherElement =
    document.getElementById("weather");


  if (!weatherElement) return;


  if (!navigator.geolocation) {

    weatherElement.textContent =
      "📍 Géolocalisation indisponible";

    return;

  }


  navigator.geolocation.getCurrentPosition(

    async position => {

      const latitude =
        position.coords.latitude;


      const longitude =
        position.coords.longitude;


      try {

        const response =
          await fetch(

            "https://api.open-meteo.com/v1/forecast" +

            "?latitude=" + latitude +

            "&longitude=" + longitude +

            "&current=temperature_2m,weather_code" +

            "&timezone=auto"

          );


        const data =
          await response.json();


        const temperature =
          Math.round(
            data.current.temperature_2m
          );


        const code =
          data.current.weather_code;


        let icon = "🌤️";


        if (code === 0)
          icon = "☀️";

        else if (code <= 3)
          icon = "🌤️";

        else if (code <= 48)
          icon = "🌫️";

        else if (code <= 67)
          icon = "🌧️";

        else if (code <= 77)
          icon = "❄️";

        else if (code <= 82)
          icon = "🌦️";

        else
          icon = "⛈️";


        weatherElement.innerHTML =

          icon +

          " <strong>" +

          temperature +

          "°C</strong>";

      }

      catch (error) {

        console.error(
          "Erreur météo :",
          error
        );

      }

    },

    () => {

      weatherElement.textContent =
        "📍 Localisation non autorisée";

    }

  );

}


/* =====================================================
   COURSES
===================================================== */

async function loadShopping() {

  const list =
    document.getElementById(
      "shoppingList"
    );


  if (!list) return;


  const { data, error } =
    await supabaseClient
      .from("course")
      .select("*")
      .order("id");


  if (error) {

    list.textContent =
      "❌ Impossible de charger.";

    return;

  }


  list.innerHTML = "";


  data.forEach(item => {

    const div =
      document.createElement("div");


    div.className = "item";


    const checkbox =
      document.createElement("input");


    checkbox.type = "checkbox";


    checkbox.checked =
      item.done;


    checkbox.onchange =
      async () => {

        await supabaseClient
          .from("course")
          .update({
            done: checkbox.checked
          })
          .eq("id", item.id);


        loadShopping();

      };


    const span =
      document.createElement("span");


    span.textContent =
      item.name;


    if (item.done) {

      span.style.textDecoration =
        "line-through";

      span.style.opacity =
        ".5";

    }


    const edit =
      document.createElement("button");


    edit.textContent = "✏️";


    edit.className = "edit";


    edit.onclick =
      async () => {

        const name =
          prompt(
            "Modifier :",
            item.name
          );


        if (!name) return;


        await supabaseClient
          .from("course")
          .update({
            name: name
          })
          .eq("id", item.id);


        loadShopping();

      };


    const del =
      document.createElement("button");


    del.textContent = "🗑️";


    del.className = "delete";


    del.onclick =
      async () => {

        if (!confirm("Supprimer ?"))
          return;


        await supabaseClient
          .from("course")
          .delete()
          .eq("id", item.id);


        loadShopping();

      };


    div.append(
      checkbox,
      span,
      edit,
      del
    );


    list.appendChild(div);

  });

}


async function addShopping() {

  const input =
    document.getElementById(
      "shoppingInput"
    );


  const name =
    input.value.trim();


  if (!name) return;


  await supabaseClient
    .from("course")
    .insert({
      name: name,
      done: false
    });


  input.value = "";


  loadShopping();

}


async function addShoppingFromAssistant(name) {

  if (!name) return;


  await supabaseClient
    .from("course")
    .insert({
      name: name,
      done: false
    });


  loadShopping();

}


/* =====================================================
   TACHES
===================================================== */

async function loadTodos() {

  const list =
    document.getElementById(
      "todoList"
    );


  if (!list) return;


  const { data, error } =
    await supabaseClient
      .from("tasks")
      .select("*")
      .order("id");


  if (error) {

    list.textContent =
      "❌ Impossible de charger.";

    return;

  }


  list.innerHTML = "";


  data.forEach(item => {

    const div =
      document.createElement("div");


    div.className = "item";


    const checkbox =
      document.createElement("input");


    checkbox.type = "checkbox";


    checkbox.checked =
      item.done;


    checkbox.onchange =
      async () => {

        await supabaseClient
          .from("tasks")
          .update({
            done: checkbox.checked
          })
          .eq("id", item.id);


        loadTodos();

      };


    const span =
      document.createElement("span");


    span.textContent =
      item.name;


    if (item.done) {

      span.style.textDecoration =
        "line-through";

      span.style.opacity =
        ".5";

    }


    const edit =
      document.createElement("button");


    edit.textContent = "✏️";


    edit.className = "edit";


    edit.onclick =
      async () => {

        const name =
          prompt(
            "Modifier :",
            item.name
          );


        if (!name) return;


        await supabaseClient
          .from("tasks")
          .update({
            name: name
          })
          .eq("id", item.id);


        loadTodos();

      };


    const del =
      document.createElement("button");


    del.textContent = "🗑️";


    del.className = "delete";


    del.onclick =
      async () => {

        if (!confirm("Supprimer ?"))
          return;


        await supabaseClient
          .from("tasks")
          .delete()
          .eq("id", item.id);


        loadTodos();

      };


    div.append(
      checkbox,
      span,
      edit,
      del
    );


    list.appendChild(div);

  });

}


async function addTodo() {

  const input =
    document.getElementById(
      "todoInput"
    );


  const name =
    input.value.trim();


  if (!name) return;


  await addTodoFromAssistant(name);


  input.value = "";

}


async function addTodoFromAssistant(name) {

  if (!name) return;


  await supabaseClient
    .from("tasks")
    .insert({
      name: name,
      done: false
    });


  loadTodos();

}


/* =====================================================
   LYCEE
===================================================== */

async function loadLycee() {

  const list =
    document.getElementById(
      "lyceeList"
    );


  if (!list) return;


  const { data, error } =
    await supabaseClient
      .from("lycee")
      .select("*")
      .order("created_at", {
        ascending: false
      });


  if (error) {

    console.error(error);

    return;

  }


  list.innerHTML = "";


  data.forEach(item => {

    const div =
      document.createElement("div");


    div.className = "item";


    const checkbox =
      document.createElement("input");


    checkbox.type = "checkbox";


    checkbox.checked =
      item.completed;


    checkbox.onchange =
      async () => {

        await supabaseClient
          .from("lycee")
          .update({
            completed: checkbox.checked
          })
          .eq("id", item.id);


        loadLycee();

      };


    const span =
      document.createElement("span");


    span.textContent =
      item.name;


    if (item.completed) {

      span.style.textDecoration =
        "line-through";

      span.style.opacity = ".5";

    }


    const del =
      document.createElement("button");


    del.textContent = "🗑️";


    del.className = "delete";


    del.onclick =
      async () => {

        await supabaseClient
          .from("lycee")
          .delete()
          .eq("id", item.id);


        loadLycee();

      };


    div.append(
      checkbox,
      span,
      del
    );


    list.appendChild(div);

  });

}


async function addLycee() {

  const input =
    document.getElementById(
      "lyceeInput"
    );


  const name =
    input.value.trim();


  if (!name) return;


  await supabaseClient
    .from("lycee")
    .insert({
      name: name,
      completed: false
    });


  input.value = "";


  loadLycee();

}


async function addLyceeFromAssistant(name) {

  if (!name) return;


  await supabaseClient
    .from("lycee")
    .insert({
      name: name,
      completed: false
    });


  loadLycee();

}


/* =====================================================
   PORTFOLIO
===================================================== */

async function loadPortfolio() {

  const list =
    document.getElementById(
      "portfolioList"
    );


  if (!list) return;


  const { data, error } =
    await supabaseClient
      .from("portfolio")
      .select("*")
      .order("created_at", {
        ascending: false
      });


  if (error) return;


  list.innerHTML = "";


  data.forEach(item => {

    const div =
      document.createElement("div");


    div.className = "item";


    const checkbox =
      document.createElement("input");


    checkbox.type = "checkbox";


    checkbox.checked =
      item.completed;


    checkbox.onchange =
      async () => {

        await supabaseClient
          .from("portfolio")
          .update({
            completed: checkbox.checked
          })
          .eq("id", item.id);


        loadPortfolio();

      };


    const span =
      document.createElement("span");


    span.textContent =
      item.name;


    if (item.completed) {

      span.style.textDecoration =
        "line-through";

      span.style.opacity = ".5";

    }


    const del =
      document.createElement("button");


    del.textContent = "🗑️";


    del.className = "delete";


    del.onclick =
      async () => {

        await supabaseClient
          .from("portfolio")
          .delete()
          .eq("id", item.id);


        loadPortfolio();

      };


    div.append(
      checkbox,
      span,
      del
    );


    list.appendChild(div);

  });

}


async function addPortfolio() {

  const input =
    document.getElementById(
      "portfolioInput"
    );


  const name =
    input.value.trim();


  if (!name) return;


  await supabaseClient
    .from("portfolio")
    .insert({
      name: name,
      completed: false
    });


  input.value = "";


  loadPortfolio();

}


/* =====================================================
   CALENDRIER
===================================================== */

async function loadEvents() {

  const list =
    document.getElementById(
      "eventsList"
    );


  if (!list) return;


  const { data, error } =
    await supabaseClient
      .from("events")
      .select("*")
      .order("start_date");


  if (error) {

    console.error(error);

    list.textContent =
      "❌ Impossible de charger.";

    return;

  }


  list.innerHTML = "";


  const today =
    new Date();


  today.setHours(
    0,
    0,
    0,
    0
  );


  for (
    let i = 0;
    i < 7;
    i++
  ) {

    const day =
      new Date(today);


    day.setDate(
      today.getDate() + i
    );


    const column =
      document.createElement("div");


    column.className =
      "calendar-day";


    const dayName =
      day.toLocaleDateString(
        "fr-FR",
        {
          weekday: "long"
        }
      );


    const date =
      day.toLocaleDateString(
        "fr-FR",
        {
          day: "numeric",
          month: "short"
        }
      );


    column.innerHTML =

      "<div class='calendar-day-title'>" +

      "<strong>" +

      dayName.charAt(0).toUpperCase() +
      dayName.slice(1) +

      "</strong>" +

      "<br>" +

      date +

      "</div>";


    const events =
      data.filter(event => {

        const eventDate =
          new Date(
            event.start_date
          );


        return (

          eventDate.getFullYear() ===
          day.getFullYear()

          &&

          eventDate.getMonth() ===
          day.getMonth()

          &&

          eventDate.getDate() ===
          day.getDate()

        );

      });


    if (events.length === 0) {

      const empty =
        document.createElement("div");


      empty.className =
        "calendar-empty";


      empty.textContent =
        "Aucun rendez-vous";


      column.appendChild(empty);

    }


    events.forEach(event => {

      const box =
        document.createElement("div");


      box.className =
        "calendar-event";


      const start =
        new Date(
          event.start_date
        );


      const time =
        start.toLocaleTimeString(
          "fr-FR",
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        );


      let endTime = "";


      if (event.end_date) {

        endTime =
          new Date(
            event.end_date
          ).toLocaleTimeString(
            "fr-FR",
            {
              hour: "2-digit",
              minute: "2-digit"
            }
          );

      }


      box.innerHTML =

        "<div class='calendar-event-time'>" +

        time +

        (

          endTime
            ? " - " + endTime
            : ""

        ) +

        "</div>" +


        "<div class='calendar-event-title'>" +

        escapeHtml(event.title) +

        "</div>" +


        "<button class='calendar-delete'>" +

        "🗑️" +

        "</button>";


      box
        .querySelector(".calendar-delete")
        .onclick =
          () => deleteEvent(event.id);


      column.appendChild(box);

    });


    list.appendChild(column);

  }

}


function openEventModal() {

  document
    .getElementById("eventModal")
    .classList
    .add("active");

}


function closeEventModal() {

  document
    .getElementById("eventModal")
    .classList
    .remove("active");

}


async function addEvent() {

  const title =
    document
      .getElementById("eventTitle")
      .value
      .trim();


  const start =
    document
      .getElementById("eventStart")
      .value;


  const end =
    document
      .getElementById("eventEnd")
      .value;


  if (!title || !start) {

    alert(
      "Indique un nom et une date."
    );

    return;

  }


  if (
    end &&
    new Date(end) <= new Date(start)
  ) {

    alert(
      "La fin doit être après le début."
    );

    return;

  }


  const { error } =
    await supabaseClient
      .from("events")
      .insert({

        title: title,

        start_date:
          new Date(start)
            .toISOString(),

        end_date:

          end

            ? new Date(end)
                .toISOString()

            : null

      });


  if (error) {

    console.error(error);

    alert(
      "Impossible d'ajouter."
    );

    return;

  }


  document
    .getElementById("eventTitle")
    .value = "";


  document
    .getElementById("eventStart")
    .value = "";


  document
    .getElementById("eventEnd")
    .value = "";


  closeEventModal();


  loadEvents();

}


async function deleteEvent(id) {

  if (!confirm("Supprimer ce rendez-vous ?"))
    return;


  await supabaseClient
    .from("events")
    .delete()
    .eq("id", id);


  loadEvents();

}


/* =====================================================
   BUDGET
===================================================== */

const budgetInitial = {

  courant: {

    nourriture: 50,

    loisirs: 50,

    autre: 30

  },


  livret_a: {

    permis_code: 1896.34,

    voiture: 3000,

    reste: 1000

  }

};


async function loadBudgets() {

  const { data, error } =
    await supabaseClient
      .from("budget_transactions")
      .select("*")
      .order("created_at");


  if (error) {

    console.error(error);

    return;

  }


  const budgets =
    JSON.parse(
      JSON.stringify(budgetInitial)
    );


  data.forEach(transaction => {

    const account =
      transaction.account;


    const category =
      transaction.category;


    const amount =
      Number(transaction.amount);


    if (
      !budgets[account] ||
      budgets[account][category] === undefined
    ) return;


    if (
      transaction.type === "expense" ||
      transaction.type === "withdrawal"
    ) {

      budgets[account][category] -= amount;

    }


    if (
      transaction.type === "deposit"
    ) {

      budgets[account][category] += amount;

    }

  });


  document
    .getElementById("courantNourriture")
    .textContent =
      budgets.courant.nourriture.toFixed(2) +
      " €";


  document
    .getElementById("courantLoisirs")
    .textContent =
      budgets.courant.loisirs.toFixed(2) +
      " €";


  document
    .getElementById("courantAutre")
    .textContent =
      budgets.courant.autre.toFixed(2) +
      " €";


  document
    .getElementById("livretPermis")
    .textContent =
      budgets.livret_a.permis_code.toFixed(2) +
      " €";


  document
    .getElementById("livretVoiture")
    .textContent =
      budgets.livret_a.voiture.toFixed(2) +
      " €";


  document
    .getElementById("livretReste")
    .textContent =
      budgets.livret_a.reste.toFixed(2) +
      " €";


  const total =

    budgets.livret_a.permis_code +

    budgets.livret_a.voiture +

    budgets.livret_a.reste;


  document
    .getElementById("livretTotal")
    .textContent =
      total.toFixed(2);

}


/* =====================================================
   TRANSACTIONS
===================================================== */

async function loadTransactions() {

  const list =
    document.getElementById(
      "transactionsList"
    );


  const { data, error } =
    await supabaseClient
      .from("budget_transactions")
      .select("*")
      .order("created_at", {
        ascending: false
      })
      .limit(10);


  if (error) return;


  if (!data.length) {

    list.textContent =
      "Aucune transaction.";

    return;

  }


  list.innerHTML = "";


  data.forEach(transaction => {

    const div =
      document.createElement("div");


    div.className =
      "transaction";


    const expense =

      transaction.type === "expense" ||

      transaction.type === "withdrawal";


    const sign =
      expense ? "−" : "+";


    div.innerHTML =

      "<div class='transaction-info'>" +

      "<span class='transaction-icon'>💰</span>" +

      "<div>" +

      "<strong>" +

      escapeHtml(
        transaction.description ||
        "Transaction"
      ) +

      "</strong>" +

      "<small>" +

      new Date(
        transaction.created_at
      ).toLocaleDateString("fr-FR") +

      "</small>" +

      "</div>" +

      "</div>" +


      "<strong class='" +

      (
        expense
          ? "expense"
          : "income"
      ) +

      "'>" +

      sign +

      Number(
        transaction.amount
      ).toFixed(2) +

      " €</strong>";


    list.appendChild(div);

  });

}


/* =====================================================
   ASSISTANT IA
===================================================== */

async function askAssistant() {

  const input =
    document.getElementById(
      "assistantInput"
    );


  const messageBox =
    document.getElementById(
      "assistantMessage"
    );


  const message =
    input.value.trim();


  if (!message) return;


  input.value = "";


  messageBox.textContent =
    "🤔 Je réfléchis...";


  try {

    const response =
      await fetch(
        "/api/assistant",
        {

          method: "POST",

          headers: {

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({

              message: message

            })

        }
      );


    const data =
      await response.json();


    messageBox.textContent =
      "🤖 " +
      (
        data.answer ||
        "Je n'ai pas compris."
      );

  }

  catch (error) {

    console.error(error);


    messageBox.textContent =
      "❌ Erreur avec l'assistant.";

  }

}


/* =====================================================
   GMAIL
===================================================== */

async function connectGmail() {

  const { error } =
    await supabaseClient
      .auth
      .signInWithOAuth({

        provider: "google",

        options: {

          redirectTo:
            window.location.origin,

          scopes:
            "https://www.googleapis.com/auth/gmail.readonly"

        }

      });


  if (error)
    console.error(error);

}


async function logoutGmail() {

  await supabaseClient
    .auth
    .signOut();


  updateGmailInterface(null);

}


async function getGmailSession() {

  const { data } =
    await supabaseClient
      .auth
      .getSession();


  return data.session;

}


function updateGmailInterface(session) {

  const connect =
    document.getElementById(
      "gmailConnectButton"
    );


  const refresh =
    document.getElementById(
      "gmailRefreshButton"
    );


  const logout =
    document.getElementById(
      "gmailLogoutButton"
    );


  const status =
    document.getElementById(
      "gmailStatus"
    );


  if (!session) {

    connect.style.display =
      "inline-block";

    refresh.style.display =
      "none";

    logout.style.display =
      "none";

    status.textContent =
      "Non connecté";

    return;

  }


  connect.style.display =
    "none";


  refresh.style.display =
    "inline-block";


  logout.style.display =
    "inline-block";


  status.textContent =
    "✅ Gmail connecté";

}


async function loadGmailMessages() {

  const container =
    document.getElementById(
      "gmailMessages"
    );


  const session =
    await getGmailSession();


  if (!session?.provider_token) {

    container.textContent =
      "Reconnecte Gmail.";

    return;

  }


  try {

    const response =
      await fetch(

        "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5",

        {

          headers: {

            Authorization:
              "Bearer " +
              session.provider_token

          }

        }

      );


    const data =
      await response.json();


    container.innerHTML = "";


    if (!data.messages) {

      container.textContent =
        "Aucun mail.";

      return;

    }


    data.messages.forEach(message => {

      const div =
        document.createElement("div");


      div.className =
        "gmail-message";


      div.textContent =
        "📧 Nouveau message";


      container.appendChild(div);

    });

  }

  catch (error) {

    console.error(error);

  }

}


/* =====================================================
   DEMARRAGE
===================================================== */

document.addEventListener(

  "DOMContentLoaded",

  async () => {

    loadWeather();

    loadShopping();

    loadTodos();

    loadLycee();

    loadPortfolio();

    loadEvents();

    loadBudgets();

    loadTransactions();


    const session =
      await getGmailSession();


    updateGmailInterface(session);


    document
      .getElementById("assistantInput")
      .addEventListener(

        "keydown",

        event => {

          if (event.key === "Enter") {

            askAssistant();

          }

        }

      );

  }

);
