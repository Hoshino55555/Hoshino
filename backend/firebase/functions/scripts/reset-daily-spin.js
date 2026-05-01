// One-off admin reset: clears the daily-spin cooldown for a user so the
// spin animation can be re-tested without waiting 24h. Uses ADC (run with
// gcloud auth, or GOOGLE_APPLICATION_CREDENTIALS pointing at a service
// account).
//
// Usage: node scripts/reset-daily-spin.js <uid>

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'hoshino-996d0' });
}

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: node scripts/reset-daily-spin.js <uid>');
  process.exit(1);
}

async function main() {
  const db = admin.firestore();
  const ref = db.collection('users').doc(uid).collection('wallet').doc('main');
  await ref.set(
    { dailySpin: { lastClaimedAtMs: 0 }, updatedAt: Date.now() },
    { merge: true }
  );
  const snap = await ref.get();
  console.log('Reset wallet for', uid);
  console.log(snap.data());
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
