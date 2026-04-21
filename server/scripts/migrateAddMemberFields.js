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

  let updated = 0;
  for (const doc of snap.docs) {
    const d = doc.data() || {};
    const patch = {};

    // Only add if missing
    if (d.cinsiyet === undefined) patch.cinsiyet = "";
    if (d.unvan === undefined) patch.unvan = "";
    if (d.gorevyeri === undefined) patch.gorevyeri = "";
    if (d.uyeno === undefined) patch.uyeno = "";
    if (d.uyetarih === undefined) patch.uyetarih = ""; // ISO string önerilir: "YYYY-MM-DD"

    if (Object.keys(patch).length === 0) continue;
    await doc.ref.set(patch, { merge: true });
    updated++;
  }

  console.log(`Updated ${updated} member docs with new fields.`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});

