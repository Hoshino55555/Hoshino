// One-off admin reset: max out a user's Moonoko stats and seed the pantry
// with a balanced ingredient spread so smoke testing isn't blocked by a
// starved character. Uses application-default credentials — run with gcloud
// ADC active, or GOOGLE_APPLICATION_CREDENTIALS pointing at a service account.
//
// Usage: node scripts/reset-moonoko.js <uid> [characterId]
//   (use scripts/find-user.js to list uids + moonokoIds)

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'hoshino-996d0' });
}

const uid = process.argv[2];
const onlyCharacterId = process.argv[3] || null;
if (!uid) {
  console.error('Usage: node scripts/reset-moonoko.js <uid> [characterId]');
  process.exit(1);
}

const SEED_COUNTS = {
  egg: 10, lettuce: 10, potato: 10, rice: 10, carrot: 10,
  banana: 6, strawberry: 6, tomato: 6, tofu: 6, oat: 6, bread: 6,
  bacon: 3, milk: 3, tuna: 3, gouda: 3,
  star_dust: 1,
};

async function main() {
  console.log('User:', uid);

  const db = admin.firestore();
  const moonokos = await db.collection('users').doc(uid).collection('moonokos').get();
  if (moonokos.empty) {
    console.error('No Moonokos found for uid', uid);
    process.exit(1);
  }

  const nowMs = Date.now();
  for (const doc of moonokos.docs) {
    if (onlyCharacterId && doc.id !== onlyCharacterId) continue;
    const state = doc.data();
    const reset = {
      ...state,
      hunger: 5,
      mood: 5,
      energy: 5,
      lastResolvedAt: nowMs,
      sleepStartedAt: null,
      moodDecayProgressMs: 0,
      lastForagedAt: nowMs,
      foragedItems: [],
    };
    await doc.ref.set(reset, { merge: false });
    console.log('  reset', doc.id, '→ hunger 5 / mood 5 / energy 5');
  }

  await db
    .collection('users')
    .doc(uid)
    .collection('inventory')
    .doc('ingredients')
    .set({ counts: SEED_COUNTS, updatedAt: nowMs }, { merge: true });
  console.log('  seeded pantry:', Object.entries(SEED_COUNTS).map(([k, v]) => `${k}×${v}`).join(', '));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
