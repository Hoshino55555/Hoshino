// List top-level collections and the first few docs in each to figure out
// where Moonoko state actually lives.

const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId: 'hoshino-996d0' });

async function main() {
  const db = admin.firestore();
  const cols = await db.listCollections();
  for (const c of cols) {
    const snap = await c.limit(3).get();
    console.log(`\n=== /${c.id}  (${snap.size} shown)`);
    for (const d of snap.docs) {
      console.log('  doc:', d.id);
      const sub = await d.ref.listCollections();
      for (const sc of sub) {
        const subSnap = await sc.limit(3).get();
        console.log('    sub:', sc.id, '→', subSnap.docs.map((s) => s.id).join(', ') || '(empty)');
      }
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
