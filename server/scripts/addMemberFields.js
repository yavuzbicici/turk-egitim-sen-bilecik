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

function parseArgs(argv) {
  const fields = [];
  let value = "";
  let onlyMissing = true;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--value") {
      value = String(argv[i + 1] ?? "");
      i++;
      continue;
    }
    if (a === "--overwrite") {
      onlyMissing = false;
      continue;
    }
    fields.push(String(a));
  }

  return { fields: fields.filter(Boolean), value, onlyMissing };
}

async function main() {
  const { fields, value, onlyMissing } = parseArgs(process.argv);
  if (fields.length === 0) {
    throw new Error("Usage: node scripts/addMemberFields.js <field1> <field2> [--value \"\"] [--overwrite]");
  }

  const db = init();
  const snap = await db.collection("members").get();

  let updated = 0;
  for (const doc of snap.docs) {
    const d = doc.data() || {};
    const patch = {};
    for (const f of fields) {
      if (onlyMissing) {
        if (d[f] === undefined) patch[f] = value;
      } else {
        patch[f] = value;
      }
    }
    if (Object.keys(patch).length === 0) continue;
    await doc.ref.set(patch, { merge: true });
    updated++;
  }

  console.log(`Updated ${updated} member docs. Fields: ${fields.join(", ")}.`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});

