const admin = require("firebase-admin");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function must(v, name) {
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function init() {
  if (admin.apps.length) return admin.firestore();
  const projectId = must(process.env.FIREBASE_PROJECT_ID, "FIREBASE_PROJECT_ID");
  const clientEmail = must(process.env.FIREBASE_CLIENT_EMAIL, "FIREBASE_CLIENT_EMAIL");
  const privateKey = must(process.env.FIREBASE_PRIVATE_KEY, "FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
  return admin.firestore();
}

async function main() {
  const db = init();
  const snap = await db.collection("members").get();
  let moved = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    // Create a new doc with auto ID and same data
    await db.collection("members").add({
      ...data,
      migratedFrom: doc.id,
      migratedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await doc.ref.delete();
    moved++;
  }

  console.log(`Migrated ${moved} member docs to auto IDs.`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});

