export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Méthode non autorisée"
    });
  }

  try {
    const { message, userId } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Aucun message reçu."
      });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY n'est pas configurée dans Vercel.");
    }

    if (!geminiKey) {
      throw new Error("GEMINI_API_KEY n'est pas configurée dans Vercel.");
    }

    /*
     * =====================================================
     * 1. CHATGPT ANALYSE LA DEMANDE
     * =====================================================
     */

    const openaiPrompt = `
Tu es le premier cerveau de "Mon Assistant", un assistant personnel.

Analyse la demande de l'utilisateur et détermine ce qu'il veut faire.

Tu dois répondre UNIQUEMENT avec un JSON valide sous cette forme :

{
  "answer": "réponse naturelle à l'utilisateur",
  "action": {
    "type": "none | add_task | delete_task | complete_task | add_shopping | delete_shopping | add_expense | delete_expense | add_reminder | delete_reminder | list_data",
    "name": "",
    "amount": null,
    "date": null,
    "category": ""
  }
}

Règles :
- add_task = ajouter une tâche
- delete_task = supprimer une tâche
- complete_task = terminer une tâche
- add_shopping = ajouter un article aux courses
- delete_shopping = supprimer un article des courses
- add_expense = enregistrer une dépense
- delete_expense = supprimer une dépense
- add_reminder = créer un rappel
- delete_reminder = supprimer un rappel
- list_data = demander la liste des tâches, courses, dépenses ou rappels
- none = simple question ou conversation

Si plusieurs actions sont demandées, choisis l'action principale pour l'instant.

Demande de l'utilisateur :
${message}
`;

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: "gpt-5",
          input: openaiPrompt
        })
      }
    );

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error("Erreur OpenAI : " + errorText);
    }

    const openaiData = await openaiResponse.json();

    const openaiText =
      openaiData.output_text ||
      "";

    /*
     * =====================================================
     * 2. GEMINI ANALYSE LA MÊME DEMANDE
     * =====================================================
     */

    const geminiPrompt = `
Tu es le deuxième cerveau de "Mon Assistant".

Analyse cette demande indépendamment de ChatGPT.

Réponds UNIQUEMENT avec un JSON valide :

{
  "answer": "réponse naturelle à l'utilisateur",
  "action": {
    "type": "none | add_task | delete_task | complete_task | add_shopping | delete_shopping | add_expense | delete_expense | add_reminder | delete_reminder | list_data",
    "name": "",
    "amount": null,
    "date": null,
    "category": ""
  }
}

Demande :
${message}
`;

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey
        },
        body: JSON.stringify({
          model: "gemini-3.7-flash",
          input: geminiPrompt
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      throw new Error("Erreur Gemini : " + errorText);
    }

    const geminiData = await geminiResponse.json();

    const geminiText =
      geminiData.output_text ||
      "";

    /*
     * =====================================================
     * 3. CHATGPT CORRIGE / ARBITRE
     * =====================================================
     */

    const correctorPrompt = `
Tu es le correcteur final de "Mon Assistant".

Deux IA ont analysé la demande de l'utilisateur.

Tu dois choisir la meilleure interprétation.

Réponds UNIQUEMENT avec un JSON valide :

{
  "answer": "réponse naturelle à l'utilisateur",
  "action": {
    "type": "none | add_task | delete_task | complete_task | add_shopping | delete_shopping | add_expense | delete_expense | add_reminder | delete_reminder | list_data",
    "name": "",
    "amount": null,
    "date": null,
    "category": ""
  }
}

IMPORTANT :
- Ne crée jamais une action si elle n'est pas clairement demandée.
- Si les deux IA sont d'accord, conserve leur interprétation.
- Si elles divergent, choisis l'interprétation la plus logique.
- Ne réponds avec aucun texte en dehors du JSON.

DEMANDE UTILISATEUR :
${message}

ANALYSE CHATGPT :
${openaiText}

ANALYSE GEMINI :
${geminiText}
`;

    const correctorResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: "gpt-5",
          input: correctorPrompt
        })
      }
    );

    if (!correctorResponse.ok) {
      const errorText = await correctorResponse.text();
      throw new Error("Erreur du correcteur : " + errorText);
    }

    const correctorData = await correctorResponse.json();

    const correctorText =
      correctorData.output_text ||
      "";

    /*
     * =====================================================
     * 4. TRANSFORMATION DU JSON FINAL
     * =====================================================
     */

    let finalResult;

    try {
      finalResult = JSON.parse(cleanJson(correctorText));
    } catch (error) {
      console.error("Réponse du correcteur :", correctorText);

      finalResult = {
        answer: correctorText || "Je n'ai pas réussi à comprendre.",
        action: {
          type: "none"
        }
      };
    }

    /*
     * =====================================================
     * 5. RÉPONSE AU SITE
     * =====================================================
     */

    return res.status(200).json({
      answer: finalResult.answer || "D'accord.",
      action: finalResult.action || { type: "none" },

      debug: {
        userId: userId || null
      }
    });

  } catch (error) {
    console.error("Assistant IA :", error);

    return res.status(500).json({
      error: error.message || "Erreur du serveur IA."
    });
  }
}


/*
 * Nettoie les éventuels blocs ```json ... ```
 */
function cleanJson(text) {
  return String(text)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}
