export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Méthode non autorisée"
    });
  }

  try {
    const { message } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Aucun message reçu."
      });
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    console.log("Gemini key présente :", !!geminiKey);

    if (!geminiKey) {
      throw new Error(
        "GEMINI_API_KEY n'est pas configurée dans Vercel."
      );
    }

    const prompt = `
Tu es Mon Assistant, un assistant personnel intelligent.

Tu dois comprendre les demandes de l'utilisateur.

Réponds UNIQUEMENT avec un JSON valide, sans texte avant ou après.

Format obligatoire :

{
  "answer": "réponse naturelle et courte",
  "action": {
    "type": "none",
    "name": "",
    "amount": null,
    "category": ""
  }
}

Actions possibles :

- none : question ou conversation normale
- add_shopping : ajouter un article à la liste de courses
- delete_shopping : supprimer un article de la liste de courses
- add_task : ajouter une tâche
- delete_task : supprimer une tâche
- complete_task : terminer une tâche
- add_expense : ajouter une dépense

Exemples :

Utilisateur : ajoute du lait à ma liste de courses

Réponse :
{
  "answer": "J'ai ajouté du lait à ta liste de courses.",
  "action": {
    "type": "add_shopping",
    "name": "lait",
    "amount": null,
    "category": ""
  }
}

Utilisateur : rappelle-moi d'appeler Paul

Réponse :
{
  "answer": "Je note que tu dois appeler Paul.",
  "action": {
    "type": "add_task",
    "name": "appeler Paul",
    "amount": null,
    "category": ""
  }
}

Utilisateur : combien y a-t-il d'habitants en France ?

Réponse :
{
  "answer": "La France compte environ 68 millions d'habitants.",
  "action": {
    "type": "none",
    "name": "",
    "amount": null,
    "category": ""
  }
}

Demande de l'utilisateur :

${message}
`;

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" +
      encodeURIComponent(geminiKey),
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],

          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();

      console.error("Erreur Gemini :", errorText);

      throw new Error(
        "Erreur Gemini : " + errorText
      );
    }

    const geminiData = await geminiResponse.json();

    const text =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text ||
      "";

    console.log("Réponse Gemini :", text);

    let result;

    try {
      result = JSON.parse(cleanJson(text));
    } catch (error) {

      console.error(
        "Impossible de lire le JSON Gemini :",
        text
      );

      result = {
        answer: text || "Je n'ai pas réussi à comprendre.",
        action: {
          type: "none",
          name: "",
          amount: null,
          category: ""
        }
      };
    }

    return res.status(200).json({
      answer: result.answer || "D'accord.",
      action: result.action || {
        type: "none"
      }
    });

  } catch (error) {

    console.error("Assistant IA :", error);

    return res.status(500).json({
      error:
        error.message ||
        "Erreur du serveur IA."
    });
  }
}


function cleanJson(text) {
  return String(text)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}
