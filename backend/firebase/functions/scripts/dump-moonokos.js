// Print hunger/mood/energy + pantry count for every known Moonoko.
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId: 'hoshino-996d0' });

async function main() {
  const db = admin.firestore();
  const mkSnap = await db.collectionGroup('moonokos').get();
  for (const d of mkSnap.docs) {
    const uid = d.ref.parent.parent.id;
    const s = d.data();
    const inv = await db.collection('users').doc(uid).collection('inventory').doc('ingredients').get();
    const counts = inv.exists ? inv.data().counts || {} : {};
    const pantryTotal = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(
      `${uid} / ${d.id}: hunger=${s.hunger} mood=${s.mood} energy=${s.energy} lvl=${s.level} xp=${s.experience} pantry=${pantryTotal}`
    );
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
