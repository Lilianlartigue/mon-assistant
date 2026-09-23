function cleanHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(function (m) {
      return m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.text === 'string';
    })
    .slice(-40)
    .map(function (m) {
      return {
        role: m.role,
        text: m.text.slice(0, 3000)
      };
    });
}

function cleanJson(text) {
  return String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Méthode non autorisée'
    });
  }

  try {
    const {
      message,
      history,
      context
    } = req.body || {};

    if (
      !message ||
      !String(message).trim()
    ) {
      return res.status(400).json({
        error: 'Aucun message reçu.'
      });
    }

    const key =
      process.env.GEMINI_API_KEY;

    if (!key) {
      throw new Error(
        "GEMINI_API_KEY n'est pas configurée dans Vercel."
      );
    }

    const conversation =
      cleanHistory(history)
        .map(function (m) {
          return (
            (
              m.role === 'user'
                ? 'Utilisateur'
                : 'Assistant'
            ) +
            ' : ' +
            m.text
          );
        })
        .join('\n');

    const prompt = `Tu es l'assistant personnel de Lilian dans son tableau de bord Mon Assistant.

STYLE
- Tutoye l'utilisateur.
- Réponds naturellement, simplement et précisément.
- Utilise le contexte et l'historique.
- Ne prétends jamais avoir modifié quelque chose tant que l'action n'a pas été confirmée dans l'interface.
- Quand une demande est ambiguë pour une modification importante, pose une question au lieu d'inventer.
- Tu peux analyser librement toutes les données fournies.

DONNÉES ACTUELLES
Tâches : ${JSON.stringify(context?.tasks || [])}
Courses : ${JSON.stringify(context?.shopping || [])}
Comptes : ${JSON.stringify(context?.accounts || [])}
Mouvements : ${JSON.stringify(context?.transactions || [])}
Objectifs : ${JSON.stringify(context?.goals || [])}
Calendrier : ${JSON.stringify(context?.events || [])}
Notes : ${JSON.stringify(context?.notes || [])}
Portfolio : ${JSON.stringify(context?.portfolio || [])}
Lieux : ${JSON.stringify(context?.places || [])}
Paramètres : ${JSON.stringify(context?.settings || {})}
Mails connectés : ${Boolean(context?.mailConnected)}
Mails disponibles : ${JSON.stringify(context?.mails || [])}

ACTIONS AUTORISÉES APRÈS CONFIRMATION
Tu peux préparer de 0 à 10 actions.

Format d'une action :
{
  "operation": "create" | "update" | "delete",
  "collection": "tasks" | "shopping" | "accounts" | "transactions" | "goals" | "events" | "notes" | "portfolio" | "places" | "settings",
  "match": "id, nom ou titre de l'élément existant pour update/delete",
  "values": {}
}

SCHÉMAS UTILES
tasks: { title, priority: "Urgente"|"Importante"|"Normale"|"Faible", due:"YYYY-MM-DD", done:boolean }
shopping: { name, quantity, category, priority, done }
accounts: { name, balance, allocation, interestRate }
transactions: { accountId ou account, type:"add"|"remove", amount, note } OU pour un virement interne { type:"transfer", fromAccountId ou fromAccount, toAccountId ou toAccount, amount, note }
goals: { name, target, saved }
events: { title, start:"YYYY-MM-DDTHH:mm", end:"YYYY-MM-DDTHH:mm", category }
notes: { title, content }
portfolio: { title, category, description, techniques, realizationDate:"YYYY-MM-DD", favorite:boolean }
places: { name, category, address, latitude, longitude }
settings: valeurs à modifier, par exemple { quietStart:"22:00", quietEnd:"08:00" }

RÈGLES
- Pour ajouter ou retirer de l'argent, utilise collection "transactions" et operation "create".
- Pour déplacer de l'argent entre deux comptes du tableau de bord, utilise collection "transactions", operation "create", type "transfer", avec fromAccount/fromAccountId et toAccount/toAccountId.
- Un virement interne ne doit jamais être représenté par deux actions séparées.
- Pour changer directement le solde, le nom, la répartition ou le taux d'un compte, utilise "accounts" + "update".
- Pour le Livret A, le compte existant s'appelle généralement "Livret A".
- Pour le Livret Jeune, le compte existant s'appelle généralement "Livret Jeune".
- Tu peux supprimer ou modifier tâches, courses, mouvements, objectifs, événements, notes, éléments du portfolio et lieux.
- Les comptes principaux sont structurels : préfère les modifier plutôt que les supprimer.
- Les mails ne sont pas modifiables tant que Mails connectés vaut false. Si l'utilisateur le demande, explique simplement qu'il faut d'abord connecter réellement Gmail/iCloud et ne crée aucune action fictive.
- N'invente jamais un identifiant. Utilise "match" avec le nom/titre quand l'id n'est pas connu.
- Si aucune modification n'est demandée, renvoie actions: [].

HISTORIQUE
${conversation || '(aucun échange précédent)'}

Réponds UNIQUEMENT avec un JSON valide :
{
  "answer": "réponse naturelle",
  "actions": [
    {
      "operation": "create",
      "collection": "tasks",
      "match": "",
      "values": {}
    }
  ]
}

NOUVEAU MESSAGE
Utilisateur : ${String(message).trim()}`;

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' +
        encodeURIComponent(key),
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json'
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
            temperature: 0.35,
            responseMimeType:
              'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      const errorText =
        await response.text();

      throw new Error(
        'Erreur Gemini : ' +
        errorText.slice(0, 500)
      );
    }

    const gemini =
      await response.json();

    const raw =
      gemini
        .candidates?.[0]
        ?.content?.parts?.[0]
        ?.text || '';

    let result;

    try {
      result =
        JSON.parse(
          cleanJson(raw)
        );
    } catch (_error) {
      result = {
        answer:
          raw ||
          "Je n'ai pas réussi à formuler ma réponse.",
        actions: []
      };
    }

    const actions =
      Array.isArray(result.actions)
        ? result.actions.slice(0, 10)
        : result.action &&
          typeof result.action === 'object' &&
          result.action.type !== 'none'
          ? [result.action]
          : [];

    return res.status(200).json({
      answer:
        String(
          result.answer ||
          'D’accord.'
        ),
      actions
    });

  } catch (error) {
    console.error(
      'Assistant v2 :',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Erreur du serveur IA.'
    });
  }
}
