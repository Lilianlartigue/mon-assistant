export default async function handler(req, res) {
  // Autoriser uniquement les requêtes POST
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

    console.log("Message reçu :", message);
    console.log("Utilisateur :", userId || "inconnu");

    // Pour l'instant, on teste simplement la communication
    // entre le site et le serveur.
    return res.status(200).json({
      answer:
        "✅ Le serveur de Mon Assistant fonctionne ! Ton message a bien été reçu : " +
        message,
      action: {
        type: "none"
      }
    });

  } catch (error) {
    console.error("Erreur assistant :", error);

    return res.status(500).json({
      error: "Une erreur est survenue sur le serveur."
    });
  }
}
