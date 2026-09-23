function cleanHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(function (m) {
      return m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.text === 'string';
    })
    .slice(-12)
    .map(function (m) {
      return {
        role: m.role,
        text: m.text.slice(0, 1400)
      };
    });
}

function cleanJson(text) {
  return String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isCulinaryQuery(message, history) {
  const recent = cleanHistory(history)
    .slice(-4)
    .map(function (item) {
      return item.text;
    })
    .join(' ');

  const text = normalizeText(
    recent + ' ' + String(message || '')
  );

  const words = [
    'repertoire cuisine',
    'recette',
    'cuisine',
    'cuisiner',
    'patisserie',
    'patissier',
    'dessert',
    'entremet',
    'tarte',
    'creme',
    'ganache',
    'mousse',
    'meringue',
    'confit',
    'glace',
    'sorbet',
    'boulangerie',
    'brioche',
    'pain',
    'pate ',
    'pate de',
    'appareil',
    'sauce',
    'jus ',
    'cuisson',
    'temperature',
    'ingredient',
    'dressage',
    'technique',
    'allergene',
    'portion',
    'gramme',
    'farine',
    'beurre',
    'oeuf',
    'chocolat',
    'fruit',
    'viande',
    'poisson',
    'legume'
  ];

  return words.some(function (word) {
    return text.includes(word);
  });
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mon-Assistant-ReadOnly/1.0'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(
        'Répertoire ' +
        response.status
      );
    }

    return await response.json();

  } finally {
    clearTimeout(timer);
  }
}

async function readCuisineDirectory(message, history) {
  if (!isCulinaryQuery(message, history)) {
    return [];
  }

  const baseUrls = [
    process.env.REPERTOIRE_CUISINE_URL,
    'https://repertoire-cuisine.vercel.app',
    'https://repertoire-cuisine-tableu-de-bord.vercel.app'
  ].filter(Boolean);

  const query = encodeURIComponent(
    String(message || '').slice(0, 260)
  );

  const attempts = baseUrls.map(function (base) {
    const url =
      String(base).replace(/\/$/, '') +
      '/api/readonly?q=' +
      query +
      '&limit=5';

    return fetchWithTimeout(url, 1800)
      .then(function (payload) {
        if (
          !payload ||
          !Array.isArray(payload.recipes)
        ) {
          throw new Error(
            'Réponse répertoire invalide'
          );
        }

        return payload.recipes;
      });
  });

  if (!attempts.length) {
    return [];
  }

  try {
    return await Promise.any(attempts);
  } catch (_error) {
    return [];
  }
}

function contextLines(context) {
  const source =
    context &&
    typeof context === 'object'
      ? context
      : {};

  const rows = [];

  if (source.tasks) {
    rows.push(
      'Tâches: ' +
      JSON.stringify(source.tasks)
    );
  }

  if (source.shopping) {
    rows.push(
      'Courses: ' +
      JSON.stringify(source.shopping)
    );
  }

  if (source.accounts) {
    rows.push(
      'Comptes: ' +
      JSON.stringify(source.accounts)
    );
  }

  if (source.transactions) {
    rows.push(
      'Mouvements récents: ' +
      JSON.stringify(source.transactions)
    );
  }

  if (source.goals) {
    rows.push(
      'Objectifs: ' +
      JSON.stringify(source.goals)
    );
  }

  if (source.events) {
    rows.push(
      'Calendrier: ' +
      JSON.stringify(source.events)
    );
  }

  if (source.notes) {
    rows.push(
      'Notes: ' +
      JSON.stringify(source.notes)
    );
  }

  if (source.portfolio) {
    rows.push(
      'Portfolio: ' +
      JSON.stringify(source.portfolio)
    );
  }

  if (source.places) {
    rows.push(
      'Lieux: ' +
      JSON.stringify(source.places)
    );
  }

  if (source.settings) {
    rows.push(
      'Paramètres: ' +
      JSON.stringify(source.settings)
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      source,
      'mailConnected'
    )
  ) {
    rows.push(
      'Mails connectés: ' +
      Boolean(source.mailConnected)
    );

    rows.push(
      'Mails disponibles: ' +
      JSON.stringify(source.mails || [])
    );
  }

  return rows.join('\n');
}

async function callGemini(key, prompt) {
  const model =
    process.env.GEMINI_MODEL ||
    'gemini-3.6-flash';

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) +
      ':generateContent?key=' +
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
          temperature: 0.3,
          maxOutputTokens: 1200,
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

  return response.json();
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

    const clean =
      cleanHistory(history);

    const [
      cuisineDirectory
    ] = await Promise.all([
      readCuisineDirectory(
        message,
        clean
      )
    ]);

    const conversation =
      clean
        .map(function (m) {
          return (
            (
              m.role === 'user'
                ? 'Utilisateur'
                : 'Assistant'
            ) +
            ': ' +
            m.text
          );
        })
        .join('\n');

    const dashboardContext =
      contextLines(context);

    const cuisineContext =
      cuisineDirectory.length
        ? JSON.stringify(
            cuisineDirectory
          ).slice(0, 14000)
        : '';

    const prompt = `Tu es l'assistant personnel de Lilian dans Mon Assistant.

Réponds en français, en tutoyant l'utilisateur. Tu peux répondre à des questions générales de tous types avec tes connaissances, même si elles ne concernent pas le tableau de bord.

Utilise seulement les données de Mon Assistant qui sont fournies ci-dessous. Si une rubrique n'est pas fournie, ne suppose pas son contenu.

CONTEXTE MON ASSISTANT
${dashboardContext || '(aucune donnée personnelle nécessaire pour cette question)'}

RÉPERTOIRE CUISINE EN LECTURE SEULE
${cuisineContext || '(aucune fiche du répertoire nécessaire ou trouvée)'}
Tu peux consulter ces fiches pour répondre aux questions de cuisine. Le Répertoire cuisine est STRICTEMENT en lecture seule : ne propose jamais d'action create/update/delete sur ce répertoire. Le Portfolio de Mon Assistant est distinct et reste modifiable.

ACTIONS SUR MON ASSISTANT
Si l'utilisateur demande une modification dans Mon Assistant, prépare jusqu'à 10 actions. Elles ne seront exécutées qu'après confirmation dans l'interface.

Format:
{
  "operation":"create"|"update"|"delete",
  "collection":"tasks"|"shopping"|"accounts"|"transactions"|"goals"|"events"|"notes"|"portfolio"|"places"|"settings",
  "match":"id, nom ou titre pour update/delete",
  "values":{}
}

Schémas utiles:
tasks {title,priority,due,done}
shopping {name,quantity,category,priority,done}
accounts {name,balance,allocation,interestRate}
transactions ajout/retrait {accountId ou account,type:"add"|"remove",amount,note}
transactions virement interne {type:"transfer",fromAccountId ou fromAccount,toAccountId ou toAccount,amount,note}
goals {name,target,saved}
events {title,start,end,category}
notes {title,content}
portfolio {title,category,description,techniques,realizationDate,favorite}
places {name,category,address,latitude,longitude}
settings {quietStart,quietEnd,...}

Règles:
- Ne prétends pas qu'une action a déjà été effectuée avant confirmation.
- Pour un virement interne, crée UNE SEULE transaction de type "transfer".
- Pour les mails, ne crée aucune action tant qu'ils ne sont pas réellement connectés.
- N'invente jamais un identifiant.
- Si aucune modification n'est demandée, renvoie actions: [].
- Réponds de façon concise sauf si l'utilisateur demande du détail.

HISTORIQUE RÉCENT
${conversation || '(aucun)'}

MESSAGE
${String(message).trim()}

Réponds UNIQUEMENT avec un JSON valide:
{"answer":"réponse naturelle","actions":[]}`;

    const gemini =
      await callGemini(
        key,
        prompt
      );

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
        : [];

    return res.status(200).json({
      answer:
        String(
          result.answer ||
          'D’accord.'
        ),
      actions,
      cuisineMatches:
        cuisineDirectory.length
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
