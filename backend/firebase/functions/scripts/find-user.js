// Scan all moonokos subcollections via collectionGroup (since parent user docs
// may have no fields, making them invisible to .collection('users').get()).
// Returns each uid with its Moonoko count and auth info (if available).

const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId: 'hoshino-996d0' });

async function main() {
  const db = admin.firestore();
  const mkSnap = await db.collectionGroup('moonokos').get();
  const byUid = new Map();
  for (const d of mkSnap.docs) {
    const uid = d.ref.parent.parent.id;
    if (!byUid.has(uid)) byUid.set(uid, []);
    byUid.get(uid).push(d.id);
  }

  const rows = [];
  for (const [uid, ids] of byUid) {
    let authInfo = null;
    try {
      const r = await admin.auth().getUser(uid);
      authInfo = {
        email: r.email || null,
        providers: r.providerData.map((p) => p.providerId).join(','),
        displayName: r.displayName || null,
        lastSignIn: r.metadata.lastSignInTime,
      };
    } catch (_) {}
    rows.push({ uid, moonokoIds: ids, auth: authInfo });
  }
  rows.sort((a, b) => (b.auth?.lastSignIn || '').localeCompare(a.auth?.lastSignIn || ''));
  console.log(JSON.stringify(rows, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
