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

function normalizeRole(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "admin" || s === "yönetici" || s === "yonetici") return "admin";
  if (s === "üye" || s === "uye") return "uye";
  return "uye";
}

function normalizeGender(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return "";
  if (s.startsWith("k")) return "kadın";
  if (s.startsWith("e")) return "erkek";
  return s;
}

function normalizeDate(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  // Accept DD.MM.YYYY -> YYYY-MM-DD
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return s;
}

function normalizeHeaderKey(v) {
  return String(v || "")
    .trim()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "") // remove combining marks (fixes İ -> i)
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseSemicolonCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(";").map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [normalizeHeaderKey(h), i]));

  const get = (cols, key, fallbacks = []) => {
    const keys = [key, ...fallbacks].map(normalizeHeaderKey);
    for (const k of keys) {
      const i = idx[k];
      if (typeof i === "number") return (cols[i] ?? "").trim();
    }
    return "";
  };

  return lines.slice(1).map((line) => {
    const cols = line.split(";");
    return {
      fullName: get(cols, "fullName", ["fullname", "adsoyad"]),
      email: get(cols, "email", ["e_posta", "mail"]),
      role: get(cols, "role", ["rol"]),
      cinsiyet: get(cols, "cinsiyet", ["gender"]),
      unvan: get(cols, "unvan", ["title"]),
      gorevyeri: get(cols, "gorevyeri", ["gorev_yeri"]),
      uyeno: get(cols, "uyeno", ["uye_no"]),
      uyetarih: get(cols, "uyetarih", ["uye_tarih"]),

      // Yeni alanlar (CSV'de: "görevyeri_İl" ve "Kurum")
      gorevyeriIl: get(cols, "gorevyeri_il", ["gorevyeri_ilce", "il"]),
      kurum: get(cols, "kurum", ["institution"]),
    };
  });
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) throw new Error("Usage: node scripts/importMembersCsv.js <path-to-members.csv>");

  const abs = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
  const raw = fs.readFileSync(abs, "utf8");
  const rows = parseSemicolonCsv(raw);

  const db = init();
  let upserts = 0;
  let skipped = 0;

  // Firestore batch max 500 writes
  let batch = db.batch();
  let batchCount = 0;

  async function commitBatch() {
    if (batchCount === 0) return;
    await batch.commit();
    batch = db.batch();
    batchCount = 0;
  }

  for (const r of rows) {
    const fullName = String(r.fullName || "").trim();
    const email = String(r.email || "").trim();
    if (!fullName || !email) {
      skipped++;
      continue;
    }
    const emailLower = email.toLowerCase();

    const role = normalizeRole(r.role);
    const cinsiyet = normalizeGender(r.cinsiyet);
    const unvan = String(r.unvan || "").trim();
    const gorevyeri = String(r.gorevyeri || "").trim();
    const uyeno = String(r.uyeno || "").trim();
    const uyetarih = normalizeDate(r.uyetarih);
    const gorevyeriIl = String(r.gorevyeriIl || "").trim();
    const kurum = String(r.kurum || "").trim();

    // Upsert by emailLower
    const q = await db.collection("members").where("emailLower", "==", emailLower).limit(1).get();
    const ref = q.empty ? db.collection("members").doc() : q.docs[0].ref;

    batch.set(
      ref,
      {
        fullName,
        email,
        emailLower,
        role,
        cinsiyet,
        unvan,
        gorevyeri,
        gorevyeriIl,
        kurum,
        uyeno,
        uyetarih,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    batchCount++;
    upserts++;

    if (batchCount >= 450) {
      await commitBatch();
    }
  }

  await commitBatch();
  console.log(`Imported ${upserts} members (skipped ${skipped}).`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});

