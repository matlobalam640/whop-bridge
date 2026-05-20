const crypto = require('crypto');

/**
 * Verify Whop webhook (Standard Webhooks spec).
 * @see https://docs.whop.com/developer/guides/webhooks
 */
function verifyWhopWebhook(rawBody, headers, webhookSecret) {
  if (!webhookSecret) return false;

  const msgId = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];

  if (!msgId || !timestamp || !signatureHeader) return false;

  const signedContent = `${msgId}.${timestamp}.${rawBody}`;
  let secretBytes;

  try {
    secretBytes = Buffer.from(webhookSecret, 'base64');
  } catch {
    secretBytes = Buffer.from(webhookSecret, 'utf8');
  }

  const expected = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  const signatures = signatureHeader.split(' ');

  for (const part of signatures) {
    const [, sigValue] = part.split(',');
    if (!sigValue) continue;

    try {
      const a = Buffer.from(sigValue);
      const b = Buffer.from(expected);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return true;
      }
    } catch {
      // continue
    }
  }

  return false;
}

module.exports = { verifyWhopWebhook };
