/* =====================================================
   SUPABASE
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


  if (!navigator.geolocation) {

    weatherElement.textContent =
      "📍 Localisation indisponible";

    return;

  }


  navigator.geolocation.getCurrentPosition(

    async position => {

      try {

        const latitude =
          position.coords.latitude;


        const longitude =
          position.coords.longitude;


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


        if (code === 0) {

          icon = "☀️";

        }

        else if (code <= 2) {

          icon = "🌤️";

        }

        else if (code === 3) {

          icon = "☁️";

        }

        else if (code >= 51 && code <= 82) {

          icon = "🌧️";

        }

        else if (code >= 95) {

          icon = "⛈️";

        }


        weatherElement.innerHTML =

          icon +

          " <strong>" +

          temperature +

          "°C</strong>";


      }

      catch (error) {

        weatherElement.textContent =
          "❌ Météo indisponible";

      }

    },

    () => {

      weatherElement.textContent =
        "📍 Autorise la localisation";

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


  const { data, error } =
    await supabaseClient
      .from("course")
      .select("*")
      .order("id", {
        ascending: true
      });


  if (error) {

    console.error(error);

    list.textContent =
      "❌ Erreur de chargement.";

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

    checkbox.checked = item.done;


    checkbox.onchange =
      () =>
        toggleShopping(
          item.id,
          item.done
        );


    const span =
      document.createElement("span");


    span.textContent =
      item.name;


    if (item.done) {

      span.style.textDecoration =
        "line-through";

      span.style.opacity = "0.5";

    }


    const edit =
      document.createElement("button");


    edit.className = "edit";

    edit.textContent = "✏️";


    edit.onclick =
      () =>
        editShopping(
          item.id,
          item.name
        );


    const del =
      document.createElement("button");


    del.className = "delete";

    del.textContent = "🗑️";


    del.onclick =
      () =>
        deleteShopping(
          item.id
        );


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


  await addShoppingFromAssistant(name);


  input.value = "";

}


async function addShoppingFromAssistant(name) {

  const { error } =
    await supabaseClient
      .from("course")
      .insert({
        name: name,
        done: false
      });


  if (error) {

    console.error(error);

    return;

  }


  await loadShopping();

}


async function toggleShopping(
  id,
  oldValue
) {

  await supabaseClient
    .from("course")
    .update({
      done: !oldValue
    })
    .eq("id", id);


  await loadShopping();

}


async function editShopping(
  id,
  oldName
) {

  const newName =
    prompt(
      "Modifier la course :",
      oldName
    );


  if (!newName) return;


  await supabaseClient
    .from("course")
    .update({
      name: newName.trim()
    })
    .eq("id", id);


  await loadShopping();

}


async function deleteShopping(id) {

  if (
    !confirm(
      "Supprimer cette course ?"
    )
  ) return;


  await supabaseClient
    .from("course")
    .delete()
    .eq("id", id);


  await loadShopping();

}



/* =====================================================
   TACHES
===================================================== */

async function loadTodos() {

  const list =
    document.getElementById("todoList");


  const { data, error } =
    await supabaseClient
      .from("tasks")
      .select("*")
      .order("id", {
        ascending: true
      });


  if (error) {

    console.error(error);

    list.textContent =
      "❌ Erreur de chargement.";

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

    checkbox.checked = item.done;


    checkbox.onchange =
      () =>
        toggleTodo(
          item.id,
          item.done
        );


    const span =
      document.createElement("span");


    span.textContent = item.name;


    if (item.done) {

      span.style.textDecoration =
        "line-through";

      span.style.opacity = "0.5";

    }


    const edit =
      document.createElement("button");


    edit.className = "edit";

    edit.textContent = "✏️";


    edit.onclick =
      () =>
        editTodo(
          item.id,
          item.name
        );


    const del =
      document.createElement("button");


    del.className = "delete";

    del.textContent = "🗑️";


    del.onclick =
      () =>
        deleteTodo(item.id);


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
    document.getElementById("todoInput");


  const name =
    input.value.trim();


  if (!name) return;


  await addTodoFromAssistant(name);


  input.value = "";

}


async function addTodoFromAssistant(name) {

  await supabaseClient
    .from("tasks")
    .insert({
      name: name,
      done: false
    });


  await loadTodos();

}


async function toggleTodo(
  id,
  oldValue
) {

  await supabaseClient
    .from("tasks")
    .update({
      done: !oldValue
    })
    .eq("id", id);


  await loadTodos();

}


async function editTodo(
  id,
  oldName
) {

  const newName =
    prompt(
      "Modifier la tâche :",
      oldName
    );


  if (!newName) return;


  await supabaseClient
    .from("tasks")
    .update({
      name: newName.trim()
    })
    .eq("id", id);


  await loadTodos();

}


async function deleteTodo(id) {

  if (
    !confirm(
      "Supprimer cette tâche ?"
    )
  ) return;


  await supabaseClient
    .from("tasks")
    .delete()
    .eq("id", id);


  await loadTodos();

}



/* =====================================================
   LYCEE
===================================================== */

async function loadLycee() {

  const list =
    document.getElementById("lyceeList");


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


    const li =
      document.createElement("li");


    li.className = "item";


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


        await loadLycee();

      };


    const span =
      document.createElement("span");


    span.textContent = item.name;


    if (item.completed) {

      span.style.textDecoration =
        "line-through";

      span.style.opacity = "0.5";

    }


    const del =
      document.createElement("button");


    del.className = "delete";

    del.textContent = "🗑️";


    del.onclick =
      async () => {

        if (
          !confirm(
            "Supprimer cet élément ?"
          )
        ) return;


        await supabaseClient
          .from("lycee")
          .delete()
          .eq("id", item.id);


        await loadLycee();

      };


    li.append(
      checkbox,
      span,
      del
    );


    list.appendChild(li);


  });

}


async function addLycee() {

  const input =
    document.getElementById("lyceeInput");


  const name =
    input.value.trim();


  if (!name) return;


  await addLyceeFromAssistant(name);


  input.value = "";

}


async function addLyceeFromAssistant(name) {

  await supabaseClient
    .from("lycee")
    .insert({
      name: name,
      completed: false
    });


  await loadLycee();

}



/* =====================================================
   PORTFOLIO
===================================================== */

async function loadPortfolio() {

  const list =
    document.getElementById(
      "portfolioList"
    );


  const { data, error } =
    await supabaseClient
      .from("portfolio")
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


    const li =
      document.createElement("li");


    li.className = "item";


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


        await loadPortfolio();

      };


    const span =
      document.createElement("span");


    span.textContent = item.name;


    if (item.completed) {

      span.style.textDecoration =
        "line-through";

      span.style.opacity = "0.5";

    }


    const del =
      document.createElement("button");


    del.className = "delete";

    del.textContent = "🗑️";


    del.onclick =
      async () => {

        if (
          !confirm(
            "Supprimer cet élément ?"
          )
        ) return;


        await supabaseClient
          .from("portfolio")
          .delete()
          .eq("id", item.id);


        await loadPortfolio();

      };


    li.append(
      checkbox,
      span,
      del
    );


    list.appendChild(li);


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


  await addPortfolioFromAssistant(name);


  input.value = "";

}


async function addPortfolioFromAssistant(name) {

  await supabaseClient
    .from("portfolio")
    .insert({
      name: name,
      completed: false
    });


  await loadPortfolio();

}



/* =====================================================
   CALENDRIER
===================================================== */

async function loadEvents() {

  const list =
    document.getElementById(
      "eventsList"
    );


  const { data, error } =
    await supabaseClient
      .from("events")
      .select("*")
      .order("start_date", {
        ascending: true
      });


  if (error) {

    console.error(error);

    list.textContent =
      "❌ Impossible de charger le calendrier.";

    return;

  }


  const today =
    new Date();


  today.setHours(
    0,
    0,
    0,
    0
  );


  list.innerHTML = "";


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


    const dateText =
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

      dateText +

      "</div>";


    const events =
      data.filter(event => {


        const eventDate =
          new Date(event.start_date);


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
        "Aucun événement";


      column.appendChild(empty);

    }


    events.forEach(event => {


      const box =
        document.createElement("div");


      box.className =
        "calendar-event";


      const start =
        new Date(event.start_date);


      const time =
        start.toLocaleTimeString(
          "fr-FR",
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        );


      box.innerHTML =

        "<div class='calendar-event-time'>" +

        time +

        "</div>" +

        "<div class='calendar-event-title'>" +

        escapeHtml(event.title) +

        "</div>";


      const deleteButton =
        document.createElement("button");


      deleteButton.className =
        "calendar-delete";


      deleteButton.textContent =
        "🗑️";


      deleteButton.onclick =
        () =>
          deleteEvent(event.id);


      box.appendChild(deleteButton);


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


  const { error } =
    await supabaseClient
      .from("events")
      .insert({

        title: title,

        start_date:
          new Date(start).toISOString(),

        end_date:

          end

            ? new Date(end).toISOString()

            : null

      });


  if (error) {

    console.error(error);

    alert(
      "Impossible d'ajouter l'événement."
    );

    return;

  }


  document.getElementById(
    "eventTitle"
  ).value = "";


  document.getElementById(
    "eventStart"
  ).value = "";


  document.getElementById(
    "eventEnd"
  ).value = "";


  closeEventModal();


  await loadEvents();

}


async function deleteEvent(id) {

  if (
    !confirm(
      "Supprimer cet événement ?"
    )
  ) return;


  await supabaseClient
    .from("events")
    .delete()
    .eq("id", id);


  await loadEvents();

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
      .order("created_at", {
        ascending: true
      });


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
      !budgets[account]
    ) return;


    if (
      budgets[account][category] ===
      undefined
    ) return;


    if (

      transaction.type === "expense" ||

      transaction.type === "withdrawal"

    ) {

      budgets[account][category] -=
        amount;

    }


    else if (
      transaction.type === "deposit"
    ) {

      budgets[account][category] +=
        amount;

    }


  });


  document.getElementById(
    "courantNourriture"
  ).textContent =

    budgets.courant.nourriture
      .toFixed(2) +

    " €";


  document.getElementById(
    "courantLoisirs"
  ).textContent =

    budgets.courant.loisirs
      .toFixed(2) +

    " €";


  document.getElementById(
    "courantAutre"
  ).textContent =

    budgets.courant.autre
      .toFixed(2) +

    " €";


  document.getElementById(
    "livretPermis"
  ).textContent =

    budgets.livret_a.permis_code
      .toFixed(2) +

    " €";


  document.getElementById(
    "livretVoiture"
  ).textContent =

    budgets.livret_a.voiture
      .toFixed(2) +

    " €";


  document.getElementById(
    "livretReste"
  ).textContent =

    budgets.livret_a.reste
      .toFixed(2) +

    " €";


  const total =

    budgets.livret_a.permis_code +

    budgets.livret_a.voiture +

    budgets.livret_a.reste;


  document.getElementById(
    "livretTotal"
  ).textContent =
    total.toFixed(2);

}



/* =====================================================
   TRANSACTIONS
===================================================== */

async function loadTransactions() {

  const container =
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


  if (error) {

    container.textContent =
      "Impossible de charger les transactions.";

    return;

  }


  if (!data.length) {

    container.textContent =
      "Aucune transaction.";

    return;

  }


  container.innerHTML = "";


  data.forEach(transaction => {


    const div =
      document.createElement("div");


    div.className =
      "transaction";


    const isExpense =

      transaction.type === "expense" ||

      transaction.type === "withdrawal";


    const date =
      new Date(
        transaction.created_at
      ).toLocaleDateString("fr-FR");


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

      date +

      "</small>" +

      "</div>" +

      "</div>" +

      "<strong class='" +

      (
        isExpense
          ? "expense"
          : "income"
      ) +

      "'>" +

      (
        isExpense
          ? "−"
          : "+"
      ) +

      Number(
        transaction.amount
      ).toFixed(2) +

      " €</strong>";


    container.appendChild(div);


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


  const userMessage =
    input.value.trim();


  if (!userMessage) return;


  messageBox.textContent =
    "🤔 Je réfléchis...";


  input.value = "";


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

              message:
                userMessage

            })

        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Erreur serveur"
      );

    }


    messageBox.textContent =
      "🤖 " +
      (
        data.answer ||
        "D'accord."
      );


  }

  catch (error) {

    console.error(error);

    messageBox.textContent =
      "❌ " +
      error.message;

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


  if (error) {

    console.error(error);

  }

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

  const connectButton =
    document.getElementById(
      "gmailConnectButton"
    );


  const refreshButton =
    document.getElementById(
      "gmailRefreshButton"
    );


  const logoutButton =
    document.getElementById(
      "gmailLogoutButton"
    );


  const status =
    document.getElementById(
      "gmailStatus"
    );


  if (!session) {

    connectButton.style.display =
      "inline-block";

    refreshButton.style.display =
      "none";

    logoutButton.style.display =
      "none";

    status.textContent =
      "Non connecté";

    return;

  }


  connectButton.style.display =
    "none";

  refreshButton.style.display =
    "inline-block";

  logoutButton.style.display =
    "inline-block";

  status.textContent =
    "✅ Gmail connecté";


  loadGmailMessages();

}


async function loadGmailMessages() {

  const container =
    document.getElementById(
      "gmailMessages"
    );


  const session =
    await getGmailSession();


  if (!session?.provider_token) {

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


    if (!data.messages) {

      container.innerHTML =
        "<p>Aucun mail trouvé.</p>";

      return;

    }


    container.innerHTML = "";


    for (
      const message of data.messages
    ) {


      const mailResponse =
        await fetch(

          "https://gmail.googleapis.com/gmail/v1/users/me/messages/" +

          message.id +

          "?format=metadata&metadataHeaders=Subject&metadataHeaders=From",

          {

            headers: {

              Authorization:
                "Bearer " +
                session.provider_token

            }

          }

        );


      const mail =
        await mailResponse.json();


      const headers =
        mail.payload.headers || [];


      const subject =
        headers.find(
          h =>
            h.name === "Subject"
        );


      const from =
        headers.find(
          h =>
            h.name === "From"
        );


      const div =
        document.createElement("div");


      div.className =
        "gmail-message";


      div.innerHTML =

        "<div class='gmail-subject'>" +

        escapeHtml(
          subject?.value ||
          "(Sans objet)"
        ) +

        "</div>" +

        "<div class='gmail-from'>" +

        escapeHtml(
          from?.value ||
          ""
        ) +

        "</div>" +

        "<div class='gmail-snippet'>" +

        escapeHtml(
          mail.snippet ||
          ""
        ) +

        "</div>";


      container.appendChild(div);


    }


  }

  catch (error) {

    console.error(error);

  }

}



/* =====================================================
   AUTH
===================================================== */

supabaseClient
  .auth
  .onAuthStateChange(
    (
      event,
      session
    ) => {

      updateGmailInterface(session);

    }
  );



/* =====================================================
   TOUCHE ENTREE IA
===================================================== */

document
  .getElementById(
    "assistantInput"
  )
  .addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter"
      ) {

        askAssistant();

      }

    }
  );



/* =====================================================
   DEMARRAGE
===================================================== */

document.addEventListener(
  "DOMContentLoaded",
  async () => {


    loadShopping();

    loadTodos();

    loadLycee();

    loadPortfolio();

    loadEvents();

    loadBudgets();

    loadTransactions();

    loadWeather();


    const session =
      await getGmailSession();


    updateGmailInterface(session);


  }
);
