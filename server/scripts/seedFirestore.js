const fs = require("fs");
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
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
  return admin.firestore();
}

async function main() {
  const db = init();
  const membersPath = path.join(__dirname, "..", "members.sample.json");
  const members = JSON.parse(fs.readFileSync(membersPath, "utf8"));

  let count = 0;

  for (const m of members) {
    const id = String(m.id || "").trim();
    const fullName = String(m.fullName || "").trim();
    const email = String(m.email || "").trim();
    const role = String(m.role || "").trim();
    const passwordHash = String(m.passwordHash || "").trim();
    const emailLower = email.toLowerCase();

    if (!fullName || !email) continue;

    const q = await db.collection("members").where("emailLower", "==", emailLower).limit(1).get();
    const data = {
      id: id || emailLower,
      fullName,
      email,
      emailLower,
      role: role || "uye",
      passwordHash,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (q.empty) {
      await db.collection("members").add(data); // auto ID
    } else {
      await q.docs[0].ref.set(data, { merge: true });
    }
    count++;
  }

  console.log(`Seeded/updated ${count} members into Firestore (collection: members).`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});

