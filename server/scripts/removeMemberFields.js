const path = require("path");
const admin = require("firebase-admin");
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
  admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
  return admin.firestore();
}

function parseFields(argv) {
  return argv.slice(2).map(String).filter(Boolean);
}

async function main() {
  const fields = parseFields(process.argv);
  if (fields.length === 0) {
    throw new Error("Usage: node scripts/removeMemberFields.js <field1> <field2> ...");
  }

  const db = init();
  const snap = await db.collection("members").get();

  let updated = 0;
  for (const doc of snap.docs) {
    const patch = {};
    for (const f of fields) patch[f] = admin.firestore.FieldValue.delete();
    await doc.ref.set(patch, { merge: true });
    updated++;
  }

  console.log(`Removed fields from ${updated} member docs. Fields: ${fields.join(", ")}.`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});

