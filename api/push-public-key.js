const {
  getVapidKeys,
  sameOriginRequest
} = require('./_push-core');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Méthode non autorisée'
    });
  }

  if (!sameOriginRequest(req)) {
    return res.status(403).json({
      error: 'Origine non autorisée'
    });
  }

  try {
    const keys =
      getVapidKeys();

    res.setHeader(
      'Cache-Control',
      'no-store'
    );

    return res.status(200).json({
      publicKey:
        keys.publicKey
    });

  } catch (error) {
    console.error(
      'Push public key:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Erreur notifications'
    });
  }
};
