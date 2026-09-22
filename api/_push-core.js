const crypto = require('crypto');
const webpush = require('web-push');
const { supabase } = require('./_calendar-sync-core');

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function getVapidKeys() {
  const seed = process.env.PUSH_VAPID_SECRET || process.env.CRON_SECRET || process.env.ICLOUD_APP_PASSWORD;
  if (!seed) throw new Error('Variable serveur manquante pour les notifications push.');

  let privateKey = crypto.createHash('sha256').update('mon-assistant-web-push-v1|' + seed).digest();
  let ecdh = crypto.createECDH('prime256v1');

  for (let i = 0; i < 4; i += 1) {
    try {
      ecdh.setPrivateKey(privateKey);
      break;
    } catch (_) {
      privateKey = crypto.createHash('sha256').update(privateKey).digest();
      ecdh = crypto.createECDH('prime256v1');
    }
  }

  return {
    publicKey: base64url(ecdh.getPublicKey()),
    privateKey: base64url(privateKey)
  };
}

function configureWebPush() {
  const keys = getVapidKeys();
  webpush.setVapidDetails('https://mon-assistant-eight.vercel.app', keys.publicKey, keys.privateKey);
  return keys;
}

function validSubscription(subscription) {
  if (!subscription || typeof subscription.endpoint !== 'string' || !subscription.endpoint.startsWith('https://')) return false;
  const keys = subscription.keys || {};
  return typeof keys.p256dh === 'string' && keys.p256dh.length > 10 &&
    typeof keys.auth === 'string' && keys.auth.length > 5;
}

function normalizeTime(value, fallback) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? String(value) : fallback;
}

function sameOriginRequest(req) {
  const host = String(req.headers.host || '');
  const origin = String(req.headers.origin || '');
  const referer = String(req.headers.referer || '');
  return !host || origin.includes(host) || referer.includes(host);
}

module.exports = {
  webpush,
  supabase,
  getVapidKeys,
  configureWebPush,
  validSubscription,
  normalizeTime,
  sameOriginRequest
};
