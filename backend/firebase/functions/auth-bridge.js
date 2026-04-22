const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { PrivyClient } = require('@privy-io/server-auth');
const admin = require('./admin');

let privy;
function getPrivy() {
  if (privy) return privy;
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new HttpsError(
      'failed-precondition',
      'PRIVY_APP_ID / PRIVY_APP_SECRET not configured on server'
    );
  }
  privy = new PrivyClient(appId, appSecret);
  return privy;
}

// Firebase UIDs are capped at 128 chars. Privy DIDs like `did:privy:cxxx...` fit.
function uidFromPrivyId(privyId) {
  return privyId;
}

exports.exchangePrivyToken = onCall(
  { cors: true, region: 'us-central1' },
  async (request) => {
    const token = request.data && request.data.privyAccessToken;
    if (!token) {
      throw new HttpsError('invalid-argument', 'Missing privyAccessToken');
    }

    let verified;
    try {
      verified = await getPrivy().verifyAuthToken(token);
    } catch (err) {
      throw new HttpsError('unauthenticated', `Invalid Privy token: ${err.message}`);
    }

    const uid = uidFromPrivyId(verified.userId);
    const customToken = await admin.auth().createCustomToken(uid, {
      privyUserId: verified.userId,
    });

    return { firebaseToken: customToken, uid };
  }
);
