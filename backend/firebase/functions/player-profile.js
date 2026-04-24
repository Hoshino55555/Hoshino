// Server-authoritative player profile. Replaces the AsyncStorage-only
// `player_profile_{wallet}` blob with a Firestore record so reinstalls don't
// wipe the user's identity + Moonoko ownership.
//
// - /users/{uid}/profile/main     → playerName, selectedCharacterId
// - /users/{uid}/moonokos/*       → source of truth for ownedCharacterIds
//
// ownedCharacterIds is derived, never stored — the list of Moonoko docs IS
// the list of owned characters.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('./admin');

const REGION = 'us-central1';
const COMMON_OPTS = { cors: true, region: REGION };

function requireAuth(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Must sign in');
  return uid;
}

function profileRef(uid) {
  return admin.firestore().collection('users').doc(uid).collection('profile').doc('main');
}

function moonokosCol(uid) {
  return admin.firestore().collection('users').doc(uid).collection('moonokos');
}

async function readProfile(uid) {
  const [profileSnap, moonokoSnap] = await Promise.all([
    profileRef(uid).get(),
    moonokosCol(uid).get(),
  ]);
  const profile = profileSnap.exists ? profileSnap.data() : {};
  const ownedCharacterIds = moonokoSnap.docs.map((d) => d.id);
  // Drop a stale selectedCharacterId pointing at a Moonoko that no longer
  // exists (future prune / manual Firestore edit).
  const selectedCharacterId =
    typeof profile.selectedCharacterId === 'string' &&
    ownedCharacterIds.includes(profile.selectedCharacterId)
      ? profile.selectedCharacterId
      : null;
  return {
    playerName: typeof profile.playerName === 'string' ? profile.playerName : '',
    ownedCharacterIds,
    selectedCharacterId,
  };
}

exports.getPlayerProfile = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  return readProfile(uid);
});

// Partial update — only the fields the client sends get written.
// ownedCharacterIds is derived, so it's not accepted.
exports.setPlayerProfile = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const update = { updatedAt: Date.now() };

  if (typeof data.playerName === 'string') {
    const trimmed = data.playerName.trim();
    if (trimmed.length > 50) {
      throw new HttpsError('invalid-argument', 'playerName max length is 50');
    }
    update.playerName = trimmed;
  }

  if (data.selectedCharacterId === null) {
    update.selectedCharacterId = null;
  } else if (typeof data.selectedCharacterId === 'string') {
    update.selectedCharacterId = data.selectedCharacterId.trim();
  }

  await profileRef(uid).set(update, { merge: true });
  return readProfile(uid);
});
