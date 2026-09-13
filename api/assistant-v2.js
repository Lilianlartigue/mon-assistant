function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
    .slice(-40)
    .map(m => ({ role: m.role, text: m.text.slice(0, 3000) }));
}

function cleanJson(text) {
  return String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const { message, history, context } = req.body || {};
    if (!message || !String(message).trim()) return res.status(400).json({ error: 'Aucun message reçu.' });

    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY n'est pas configurée dans Vercel.");

    const conversation = cleanHistory(history)
      .map(m => (m.role === 'user' ? 'Utilisateur' : 'Assistant') + ' : ' + m.text)
      .join('\n');

    const prompt = `Tu es l'assistant personnel de Lilian dans son tableau de bord.

STYLE DE CONVERSATION
- Parle naturellement, comme un assistant humain, chaleureux et efficace.
- Tutoye l'utilisateur.
- Réponds directement sans phrases robotiques ni formules répétitives.
- Utilise le contexte des messages précédents. Si l'utilisateur dit "ça", "lui", "comme avant" ou fait référence à une discussion récente, relie correctement la référence.
- Tu peux être léger et naturel, mais reste utile et précis.
- Ne répète pas inutilement ce que l'utilisateur vient de dire.
- Si tu ne sais pas quelque chose, dis-le simplement au lieu d'inventer.
- Pour une question simple, réponds brièvement. Pour une demande complexe, explique clairement.

MÉMOIRE DE LA CONVERSATION
${conversation || '(aucun échange précédent)'}

DONNÉES ACTUELLES DU TABLEAU DE BORD
Tâches : ${JSON.stringify(context?.tasks || [])}
Courses : ${JSON.stringify(context?.courses || [])}
Comptes : ${JSON.stringify(context?.accounts || [])}
Transactions : ${JSON.stringify(context?.transactions || [])}
Objectifs : ${JSON.stringify(context?.goals || [])}
Calendrier : ${JSON.stringify(context?.events || [])}
Notes : ${JSON.stringify(context?.notes || [])}
Recettes : ${JSON.stringify(context?.recipes || [])}

ACTIONS DISPONIBLES
- none
- add_task
- add_shopping

Si l'utilisateur demande une modification qui correspond à une action disponible, prépare cette action. Sinon utilise "none".
Ne prétends jamais avoir effectué une action qui n'est pas disponible.

Réponds UNIQUEMENT avec un JSON valide sous cette forme :
{
  "answer": "réponse naturelle à afficher à l'utilisateur",
  "action": {
    "type": "none",
    "name": "",
    "description": ""
  }
}

NOUVEAU MESSAGE
Utilisateur : ${String(message).trim()}`;

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + encodeURIComponent(key),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.65,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error('Erreur Gemini : ' + errorText.slice(0, 500));
    }

    const gemini = await response.json();
    const raw = gemini.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let result;
    try {
      result = JSON.parse(cleanJson(raw));
    } catch (_) {
      result = { answer: raw || "Je n'ai pas réussi à formuler ma réponse.", action: { type: 'none' } };
    }

    return res.status(200).json({
      answer: String(result.answer || 'D’accord.'),
      action: result.action && typeof result.action === 'object' ? result.action : { type: 'none' }
    });
  } catch (error) {
    console.error('Assistant v2 :', error);
    return res.status(500).json({ error: error.message || 'Erreur du serveur IA.' });
  }
}
