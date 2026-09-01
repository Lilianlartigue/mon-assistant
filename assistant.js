/* =====================================================
   MON ASSISTANT - assistant.js
   Interface entre index.html et le moteur IA
   ===================================================== */

const ASSISTANT_API_URL = "/api/assistant";

// Identifiant utilisateur.
// Pour l'instant on utilise "default".
// Plus tard, on pourra utiliser l'identifiant Supabase.
function getAssistantUserId() {
  return localStorage.getItem("assistant_user_id") || "default";
}


/* =====================================================
   ENVOYER UNE DEMANDE À L'IA
   ===================================================== */

async function askAssistant() {

  const input =
    document.getElementById("assistantInput");

  const messageBox =
    document.getElementById("assistantMessage");

  const value =
    input.value.trim();

  if (!value) {
    return;
  }

  // Affichage immédiat
  messageBox.innerHTML =
    "💭 <strong>Réflexion...</strong>";

  input.disabled = true;

  try {

    const response =
      await fetch(
        ASSISTANT_API_URL,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            userId: getAssistantUserId(),
            message: value
          })
        }
      );


    if (!response.ok) {

      let errorMessage =
        "Erreur de communication avec l'IA.";

      try {

        const error =
          await response.json();

        if (error.error) {
          errorMessage =
            error.error;
        }

      } catch (_) {}

      throw new Error(
        errorMessage
      );
    }


    const result =
      await response.json();


    /* =================================================
       REPONSE DE L'IA
       ================================================= */

    if (result.answer) {

      messageBox.innerHTML =
        escapeHtml(
          result.answer
        ).replace(
          /\n/g,
          "<br>"
        );

    }


    /* =================================================
       ACTION EFFECTUEE
       ================================================= */

    if (
      result.action &&
      result.action.type !== "none"
    ) {

      showAssistantAction(
        result.action,
        result.actionResult
      );

    }


    /* =================================================
       ACTUALISATION DE L'INTERFACE
       ================================================= */

    await refreshAssistantData(
      result.action
    );


  } catch (error) {

    console.error(
      "Assistant IA :",
      error
    );


    messageBox.innerHTML =
      "❌ " +
      escapeHtml(
        error.message ||
        "Une erreur est survenue."
      );

  } finally {

    input.disabled = false;

    input.focus();

  }

}


/* =====================================================
   AFFICHER L'ACTION REALISEE
   ===================================================== */

function showAssistantAction(
  action,
  actionResult
) {

  const messageBox =
    document.getElementById(
      "assistantMessage"
    );

  let text = "";


  switch (
    action.type
  ) {

    case "add_task":
      text =
        "✅ Tâche ajoutée.";
      break;


    case "delete_task":
      text =
        "🗑️ Tâche supprimée.";
      break;


    case "complete_task":
      text =
        "☑️ Tâche terminée.";
      break;


    case "add_shopping":
      text =
        "🛒 Course ajoutée.";
      break;


    case "delete_shopping":
      text =
        "🗑️ Course supprimée.";
      break;


    case "add_expense":
      text =
        "💰 Dépense enregistrée.";
      break;


    case "delete_expense":
      text =
        "🗑️ Dépense supprimée.";
      break;


    case "add_reminder":
      text =
        "⏰ Rappel créé.";
      break;


    case "delete_reminder":
      text =
        "🗑️ Rappel supprimé.";
      break;


    case "list_data":
      text =
        "📋 Informations récupérées.";
      break;


    default:
      return;

  }


  if (
    actionResult &&
    actionResult.deleted !== undefined
  ) {

    if (
      actionResult.deleted === 0
    ) {

      text =
        "⚠️ Aucun élément correspondant trouvé.";

    }

  }


  messageBox.innerHTML +=
    "<br><small>" +
    escapeHtml(text) +
    "</small>";

}


/* =====================================================
   ACTUALISER LES DONNEES DE L'INTERFACE
   ===================================================== */

async function refreshAssistantData(
  action
) {

  if (!action) {
    return;
  }


  /*
   * Si l'IA a modifié les courses,
   * on recharge la liste.
   */

  if (
    action.type ===
      "add_shopping" ||

    action.type ===
      "delete_shopping"
  ) {

    if (
      typeof loadShopping ===
      "function"
    ) {

      await loadShopping();

    }

  }


  /*
   * Si l'IA a modifié les tâches,
   * on recharge la liste.
   */

  if (
    action.type ===
      "add_task" ||

    action.type ===
      "delete_task" ||

    action.type ===
      "complete_task"
  ) {

    if (
      typeof loadTodos ===
      "function"
    ) {

      await loadTodos();

    }

  }


  /*
   * Les budgets actuels de ton index
   * sont encore gérés localement.
   */

  if (
    typeof updateBudgets ===
    "function"
  ) {

    updateBudgets();

  }

}


/* =====================================================
   TOUCHE ENTREE
   ===================================================== */

function setupAssistantKeyboard() {

  const input =
    document.getElementById(
      "assistantInput"
    );

  if (!input) {
    return;
  }


  input.addEventListener(
    "keydown",
    function(event) {

      if (
        event.key ===
        "Enter"
      ) {

        event.preventDefault();

        askAssistant();

      }

    }
  );

}


/* =====================================================
   IDENTIFIANT UTILISATEUR
   ===================================================== */

function setAssistantUserId(
  userId
) {

  if (!userId) {
    return;
  }

  localStorage.setItem(
    "assistant_user_id",
    String(userId)
  );

}


/* =====================================================
   ECHAPPER LE HTML
   ===================================================== */

function escapeHtml(
  text
) {

  const div =
    document.createElement(
      "div"
    );

  div.textContent =
    text == null
      ? ""
      : String(text);

  return div.innerHTML;

}


/* =====================================================
   DEMARRAGE
   ===================================================== */

document.addEventListener(
  "DOMContentLoaded",
  function() {

    setupAssistantKeyboard();

    console.log(
      "🤖 Mon Assistant IA prêt."
    );

  }
);
