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


    console.log(
      "Gemini key présente :",
      !!geminiKey
    );


    if (!geminiKey) {

      throw new Error(
        "GEMINI_API_KEY n'est pas configurée dans Vercel."
      );

    }


    const prompt = `
Tu es Mon Assistant, un assistant personnel intelligent.

Tu dois comprendre précisément les demandes de l'utilisateur.

Tu peux gérer :

- les courses
- les tâches
- les dépenses
- les budgets
- les questions générales

IMPORTANT :

L'utilisateur possède deux comptes :

1. COMPTE COURANT

Catégories possibles :

- nourriture
- loisirs
- autre


2. LIVRET A

Catégories possibles :

- permis_code
- voiture
- reste


Pour chaque dépense ou mouvement d'argent, tu dois déterminer :

- le compte
- la catégorie
- le montant
- la description


Réponds UNIQUEMENT avec un JSON valide.

Format obligatoire :

{
  "answer": "réponse naturelle et courte",
  "action": {
    "type": "none",
    "name": "",
    "amount": null,
    "account": "",
    "category": "",
    "description": ""
  }
}


Actions possibles :

- none
- add_shopping
- delete_shopping
- add_task
- delete_task
- complete_task
- add_expense
- add_deposit
- add_withdrawal


RÈGLES POUR LES BUDGETS :

Une dépense normale est généralement sur le compte courant.

Exemples :

Restaurant, McDonald's, courses alimentaires :
account = "courant"
category = "nourriture"

Cinéma, jeu vidéo, sortie, abonnement loisir :
account = "courant"
category = "loisirs"

Achat qui ne correspond pas aux deux précédentes :
account = "courant"
category = "autre"


Pour le Livret A :

Permis, code de la route, auto-école :
account = "livret_a"
category = "permis_code"

Voiture, achat voiture, assurance voiture :
account = "livret_a"
category = "voiture"

Épargne sans objectif précis :
account = "livret_a"
category = "reste"


EXEMPLES :


Utilisateur :

ajoute du lait à ma liste de courses


Réponse :

{
  "answer": "J'ai ajouté du lait à ta liste de courses.",
  "action": {
    "type": "add_shopping",
    "name": "lait",
    "amount": null,
    "account": "",
    "category": "",
    "description": ""
  }
}


Utilisateur :

rappelle-moi d'appeler Paul


Réponse :

{
  "answer": "Je note que tu dois appeler Paul.",
  "action": {
    "type": "add_task",
    "name": "appeler Paul",
    "amount": null,
    "account": "",
    "category": "",
    "description": ""
  }
}


Utilisateur :

j'ai dépensé 12 euros au McDonald's


Réponse :

{
  "answer": "J'ai ajouté cette dépense de 12 € dans ton budget nourriture.",
  "action": {
    "type": "add_expense",
    "name": "",
    "amount": 12,
    "account": "courant",
    "category": "nourriture",
    "description": "McDonald's"
  }
}


Utilisateur :

j'ai dépensé 25 euros au cinéma


Réponse :

{
  "answer": "J'ai ajouté cette dépense de 25 € dans ton budget loisirs.",
  "action": {
    "type": "add_expense",
    "name": "",
    "amount": 25,
    "account": "courant",
    "category": "loisirs",
    "description": "cinéma"
  }
}


Utilisateur :

j'ai payé 40 euros pour le code


Réponse :

{
  "answer": "J'ai retiré 40 € de ton budget Permis + Code.",
  "action": {
    "type": "add_expense",
    "name": "",
    "amount": 40,
    "account": "livret_a",
    "category": "permis_code",
    "description": "code de la route"
  }
}


Utilisateur :

j'ai mis 100 euros de côté pour ma voiture


Réponse :

{
  "answer": "J'ai ajouté 100 € à ton budget voiture.",
  "action": {
    "type": "add_deposit",
    "name": "",
    "amount": 100,
    "account": "livret_a",
    "category": "voiture",
    "description": "épargne voiture"
  }
}


Utilisateur :

combien y a-t-il d'habitants en France ?


Réponse :

{
  "answer": "La France compte environ 68 millions d'habitants.",
  "action": {
    "type": "none",
    "name": "",
    "amount": null,
    "account": "",
    "category": "",
    "description": ""
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

      const errorText =
        await geminiResponse.text();


      console.error(
        "Erreur Gemini :",
        errorText
      );


      throw new Error(
        "Erreur Gemini : " +
        errorText
      );

    }


    const geminiData =
      await geminiResponse.json();


    const text =

      geminiData
        .candidates?.[0]
        ?.content?.parts?.[0]
        ?.text ||

      "";


    console.log(
      "Réponse Gemini :",
      text
    );


    let result;


    try {

      result =
        JSON.parse(
          cleanJson(text)
        );

    } catch (error) {

      console.error(
        "Impossible de lire le JSON Gemini :",
        text
      );


      result = {

        answer:
          text ||
          "Je n'ai pas réussi à comprendre.",

        action: {

          type: "none",

          name: "",

          amount: null,

          account: "",

          category: "",

          description: ""

        }

      };

    }


    return res.status(200).json({

      answer:
        result.answer ||
        "D'accord.",

      action:
        result.action ||
        {
          type: "none"
        }

    });


  } catch (error) {


    console.error(
      "Assistant IA :",
      error
    );


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
