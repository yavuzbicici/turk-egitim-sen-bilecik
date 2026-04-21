const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, ".env"),
  override: true,
});

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");
const multer = require("multer");

/** Dashboard’daki `cloudinary://API_KEY:SECRET@CLOUD` tek satırı. */
function parseCloudinaryUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;
  if (/^CLOUDINARY_URL=/i.test(s)) s = s.replace(/^CLOUDINARY_URL=\s*/i, "").trim();
  const m = s.match(/^cloudinary:\/\/([^:]+):([^@]+)@([^/]+)\/?$/i);
  if (!m) return null;
  const apiKey = String(m[1] || "").trim();
  const apiSecret = String(m[2] || "").trim();
  const cloudName = String(m[3] || "").trim();
  if (!apiKey || !apiSecret || !cloudName) return null;
  if (/<your|your_api_key|your_api_secret/i.test(apiKey + apiSecret)) return null;
  return { apiKey, apiSecret, cloudName };
}

/** Örn: CLOUDINARY_API_KEY=CLOUDINARY_URL=cloudinary://... tek satırda yapıştırılmışsa ayıkla. */
function demangleCloudinaryApiKeyField() {
  let k = String(process.env.CLOUDINARY_API_KEY || "").trim();
  if (!k) return;
  const lower = k.toLowerCase();
  const marker = "cloudinary_url=";
  const idx = lower.indexOf(marker);
  if (idx < 0) return;
  const rest = k.slice(idx + marker.length).trim();
  const p = parseCloudinaryUrl(rest);
  if (!p) {
    console.warn("[config] CLOUDINARY_API_KEY içinde CLOUDINARY_URL= var ama ayrıştırılamadı; .env’i düzeltin.");
    return;
  }
  if (!String(process.env.CLOUDINARY_CLOUD_NAME || "").trim()) process.env.CLOUDINARY_CLOUD_NAME = p.cloudName;
  process.env.CLOUDINARY_API_KEY = p.apiKey;
  process.env.CLOUDINARY_API_SECRET = p.apiSecret;
  delete process.env.CLOUDINARY_URL;
  console.warn("[config] CLOUDINARY_API_KEY satırına gömülü CLOUDINARY_URL= ayrıştırıldı.");
}

/** Şablon `CLOUDINARY_URL` SDK tarafından okunursa api_key tamamen bozulur — sil. */
function stripInvalidCloudinaryUrl() {
  const raw = process.env.CLOUDINARY_URL;
  if (raw == null || String(raw).trim() === "") return;
  const s = String(raw);
  if (/<your|your_api_key|your_api_secret/i.test(s) || !parseCloudinaryUrl(s)) {
    delete process.env.CLOUDINARY_URL;
    console.warn(
      "[config] Cloudinary: Geçersiz veya örnek (placeholder) CLOUDINARY_URL kaldırıldı. Gerçek anahtarlar için CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET kullanın.",
    );
  }
}

/** Bazen CLOUDINARY_API_KEY alanına tüm URL satırı yapıştırılıyor; CLOUDINARY_URL varsa ondan düzelt. */
function applyCloudinaryEnvOverrides() {
  demangleCloudinaryApiKeyField();
  stripInvalidCloudinaryUrl();
  const parsed = parseCloudinaryUrl(process.env.CLOUDINARY_URL);
  const key = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const secret = String(process.env.CLOUDINARY_API_SECRET || "").trim();
  const keyMalformed =
    !key ||
    /CLOUDINARY_URL|cloudinary:\/\//i.test(key) ||
    /<your|your_api_key/i.test(key) ||
    (key.includes("=") && key.toLowerCase().includes("cloudinary"));
  const secretMalformed = !secret || /<your|your_api_secret/i.test(secret);

  if (parsed && (keyMalformed || secretMalformed)) {
    process.env.CLOUDINARY_CLOUD_NAME = parsed.cloudName;
    process.env.CLOUDINARY_API_KEY = parsed.apiKey;
    process.env.CLOUDINARY_API_SECRET = parsed.apiSecret;
    console.warn(
      "[config] Cloudinary: API_KEY / API_SECRET alanında şablon veya URL satırı vardı; CLOUDINARY_URL içinden düzeltildi. Kalıcı çözüm: .env’de sadece rakam olan API_KEY ve ayrı SECRET kullanın.",
    );
    return;
  }
  if (parsed) {
    if (!String(process.env.CLOUDINARY_CLOUD_NAME || "").trim()) process.env.CLOUDINARY_CLOUD_NAME = parsed.cloudName;
    if (!String(process.env.CLOUDINARY_API_KEY || "").trim()) process.env.CLOUDINARY_API_KEY = parsed.apiKey;
    if (!String(process.env.CLOUDINARY_API_SECRET || "").trim()) process.env.CLOUDINARY_API_SECRET = parsed.apiSecret;
  }
}

applyCloudinaryEnvOverrides();

function cloudinaryConfigured() {
  const name = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const key = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const secret = String(process.env.CLOUDINARY_API_SECRET || "").trim();
  if (!name || !key || !secret) return false;
  if (/CLOUDINARY_URL|cloudinary:\/\//i.test(key)) return false;
  if (/<your|your_api/i.test(key) || /<your|your_api/i.test(secret)) return false;
  return true;
}

const cloudinary = require("cloudinary").v2;

if (cloudinaryConfigured()) {
  // SDK ilk config() çağrısında process.env.CLOUDINARY_URL okuyor; şablon URL api_key'i bozuyor.
  delete process.env.CLOUDINARY_URL;
  delete process.env.CLOUDINARY_ACCOUNT_URL;
  cloudinary.config(true);
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const announcementImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (String(file.mimetype || "").startsWith("image/")) cb(null, true);
    else cb(new Error("Sadece resim dosyası yüklenebilir"));
  },
});

async function uploadAnnouncementImageToCloudinary(buffer, mimetype) {
  const mt = String(mimetype || "image/jpeg").toLowerCase();
  const safeMime = mt.startsWith("image/") ? mt : "image/jpeg";
  const b64 = buffer.toString("base64");
  const dataUri = `data:${safeMime};base64,${b64}`;
  const folder = String(process.env.CLOUDINARY_UPLOAD_FOLDER || "tes-bilecik/announcements").trim() || "tes-bilecik/announcements";
  // Yükleme sırasında "fetch_format: auto" / "quality: auto" bazı hesaplarda 500 üretebiliyor; sade tut.
  return cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: "image",
    transformation: [{ width: 1280, crop: "limit" }],
  });
}

async function destroyCloudinaryAsset(publicId) {
  if (!cloudinaryConfigured() || !publicId) return;
  try {
    await cloudinary.uploader.destroy(String(publicId));
  } catch (e) {
    console.error("Cloudinary destroy failed:", e?.message || e);
  }
}

const app = express();

/** GET / — req.path / req.url katmanlarda değişebildiği için originalUrl kullan; en üstte kayıtlı olsun. */
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  let pathOnly = String(req.originalUrl || "/").split("?")[0] || "/";
  if (pathOnly.length > 1 && pathOnly.endsWith("/")) pathOnly = pathOnly.slice(0, -1);
  if (pathOnly === "" || pathOnly === "/") {
    return res.json({
      ok: true,
      service: "Türk Eğitim-Sen Bilecik API",
      hint: "Bu adres mobil uygulamanın backend’idir. Arayüz için Expo web (örn. http://localhost:8081) kullanın.",
      endpoints: { health: "/health", announcements: "/announcements", authLogin: "/auth/login" },
    });
  }
  next();
});

app.use(
  cors({
    // Expo web (8081), LAN IP ve curl; tarayıcıdan istatistik istekleri için yansıtılmış origin
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      return cb(null, origin);
    },
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "Accept-Language", "Origin", "X-Requested-With"],
    optionsSuccessStatus: 204,
  }),
);
app.use(express.json());

/** Duyuru POST'unun gerçekten bu sürece gelip gelmediğini ayırt etmek için (başka porta / eski süreç). */
app.use((req, res, next) => {
  const pathOnly = String(req.originalUrl || req.url || "").split("?")[0];
  if (req.method === "POST" && pathOnly === "/announcements") {
    console.log("[http] POST /announcements — istek bu Node sürecine düştü");
  }
  next();
});

const PORT = Number(process.env.PORT || 8787);

function normalizeFullName(v) {
  // We use "username-like" format for fullName:
  // "Ayşe Kaplan" -> "ayse.kaplan"
  return String(v || "")
    .trim()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "") // remove combining marks
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function normalizeUyeTarih(v) {
  const s = String(v || "").trim();
  if (!s) return "";

  // DDMMYYYY (e.g. 07052025) -> 07.05.2025
  const m0 = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m0) return `${m0[1]}.${m0[2]}.${m0[3]}`;

  // DD.MM.YYYY (keep)
  const m1 = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m1) return s;

  // YYYY-MM-DD -> DD.MM.YYYY
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return `${m2[3]}.${m2[2]}.${m2[1]}`;

  return s;
}

function getAuthSecret() {
  return process.env.AUTH_TOKEN_SECRET || "";
}

function b64urlEncode(buf) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlEncodeJson(obj) {
  return b64urlEncode(Buffer.from(JSON.stringify(obj)));
}

function b64urlDecodeJson(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

function signToken(payload) {
  const secret = getAuthSecret();
  if (!secret) return null;
  const header = b64urlEncodeJson({ alg: "HS256", typ: "JWT" });
  const body = b64urlEncodeJson(payload);
  const data = `${header}.${body}`;
  const sig = b64urlEncode(crypto.createHmac("sha256", secret).update(data).digest());
  return `${data}.${sig}`;
}

function verifyToken(token) {
  const secret = getAuthSecret();
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const data = `${h}.${p}`;
  const expected = b64urlEncode(crypto.createHmac("sha256", secret).update(data).digest());
  const ok = expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  if (!ok) return null;
  const payload = b64urlDecodeJson(p);
  if (payload?.exp && Date.now() > payload.exp) return null;
  return payload;
}

function getBearer(req) {
  const h = req.headers.authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function requireAdmin(req) {
  const token = getBearer(req);
  const payload = verifyToken(token);
  if (!payload) return { ok: false, status: 401, reason: "Yetkisiz" };
  if (payload.role !== "admin") return { ok: false, status: 403, reason: "Yetki yok" };
  return { ok: true, payload };
}

const membersPath = path.join(__dirname, "members.json");
const membersSamplePath = path.join(__dirname, "members.sample.json");
function loadMembers() {
  try {
    return JSON.parse(fs.readFileSync(membersPath, "utf8"));
  } catch {
    // Dev convenience: if members.json is missing, fall back to sample data.
    try {
      const sample = JSON.parse(fs.readFileSync(membersSamplePath, "utf8"));
      // Best-effort: persist sample as members.json to make the state explicit.
      try {
        fs.writeFileSync(membersPath, JSON.stringify(sample, null, 2) + "\n", "utf8");
      } catch {
        // ignore
      }
      return Array.isArray(sample) ? sample : [];
    } catch {
      return [];
    }
  }
}
function saveMembers(members) {
  fs.writeFileSync(membersPath, JSON.stringify(members, null, 2) + "\n", "utf8");
}

function firebaseEnabled() {
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

function initFirebase() {
  if (!firebaseEnabled()) return null;
  if (admin.apps.length) return admin.firestore();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, "\n");

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });

  return admin.firestore();
}

function memberFromDoc(doc) {
  const d = doc.data() || {};
  return {
    id: String(d.id ?? doc.id ?? "").trim(),
    fullName: String(d.fullName ?? "").trim(),
    email: String(d.email ?? "").trim(),
    role: String(d.role ?? "").trim(),
    passwordHash: String(d.passwordHash ?? "").trim(),
  };
}

function memberProfileFromDoc(doc) {
  const d = doc.data() || {};
  return {
    id: String(d.id ?? doc.id ?? "").trim(),
    fullName: String(d.fullName ?? "").trim(),
    email: String(d.email ?? "").trim(),
    role: String(d.role ?? "").trim(),
    cinsiyet: String(d.cinsiyet ?? '').trim(),
    unvan: String(d.unvan ?? '').trim(),
    gorevyeri: String(d.gorevyeri ?? '').trim(),
    gorevyeriIl: String(d.gorevyeriIl ?? '').trim(),
    kurum: String(d.kurum ?? '').trim(),
    uyeno: String(d.uyeno ?? '').trim(),
    uyetarih: String(d.uyetarih ?? '').trim(),
  };
}

async function getMembersFromFirebase() {
  const db = initFirebase();
  if (!db) return null;
  const snap = await db.collection("members").get();
  return snap.docs.map(memberFromDoc).filter((m) => m.fullName);
}

async function getMembersAdminListFromFirebase() {
  const db = initFirebase();
  if (!db) return null;
  const snap = await db.collection("members").get();
  return snap.docs.map((doc) => {
    const d = doc.data() || {};
    return {
      docId: doc.id,
      fullName: String(d.fullName ?? "").trim(),
      email: String(d.email ?? "").trim(),
      emailLower: String(d.emailLower ?? "").trim(),
      role: String(d.role ?? "").trim(),
      cinsiyet: String(d.cinsiyet ?? "").trim(),
      unvan: String(d.unvan ?? "").trim(),
      gorevyeri: String(d.gorevyeri ?? "").trim(),
      gorevyeriIl: String(d.gorevyeriIl ?? "").trim(),
      kurum: String(d.kurum ?? "").trim(),
      uyeno: String(d.uyeno ?? "").trim(),
      uyetarih: String(d.uyetarih ?? "").trim(),
      hasPassword: Boolean(String(d.passwordHash ?? "").trim()),
    };
  });
}

function memberAdminRowFromDoc(doc) {
  const d = doc.data() || {};
  return {
    docId: doc.id,
    fullName: String(d.fullName ?? "").trim(),
    email: String(d.email ?? "").trim(),
    emailLower: String(d.emailLower ?? "").trim(),
    role: String(d.role ?? "").trim(),
    cinsiyet: String(d.cinsiyet ?? "").trim(),
    unvan: String(d.unvan ?? "").trim(),
    gorevyeri: String(d.gorevyeri ?? "").trim(),
    gorevyeriIl: String(d.gorevyeriIl ?? "").trim(),
    kurum: String(d.kurum ?? "").trim(),
    uyeno: String(d.uyeno ?? "").trim(),
    uyetarih: String(d.uyetarih ?? "").trim(),
    hasPassword: Boolean(String(d.passwordHash ?? "").trim()),
  };
}

async function searchMembersAdminFromFirebase(q, limit = 20) {
  const db = initFirebase();
  if (!db) return null;
  const query = String(q || "").trim().toLowerCase();
  if (!query) return [];

  const lim = Math.max(1, Math.min(50, Number(limit) || 20));
  const resultsById = new Map();

  const end = query + "\uf8ff";

  // Prefix search by fullName (we store username-like, so prefix works well)
  const q1 = await db
    .collection("members")
    .orderBy("fullName")
    .startAt(query)
    .endAt(end)
    .limit(lim)
    .get()
    .catch(() => null);
  if (q1 && !q1.empty) {
    for (const doc of q1.docs) resultsById.set(doc.id, memberAdminRowFromDoc(doc));
  }

  // Prefix search by emailLower
  const q2 = await db
    .collection("members")
    .orderBy("emailLower")
    .startAt(query)
    .endAt(end)
    .limit(lim)
    .get()
    .catch(() => null);
  if (q2 && !q2.empty) {
    for (const doc of q2.docs) resultsById.set(doc.id, memberAdminRowFromDoc(doc));
  }

  return Array.from(resultsById.values()).slice(0, lim);
}

async function createMemberInFirebase(data) {
  const db = initFirebase();
  if (!db) return null;
  const fullName = normalizeFullName(data?.fullName);
  const email = String(data?.email ?? "").trim();
  const roleRaw = String(data?.role ?? "uye").trim().toLowerCase();
  const role = roleRaw === "admin" ? "admin" : "uye";
  if (!fullName || !email) return { ok: false, reason: "Ad Soyad ve E-posta gerekli" };

  const emailLower = email.toLowerCase();
  const existing = await db.collection("members").where("emailLower", "==", emailLower).limit(1).get();
  if (!existing.empty) return { ok: false, reason: "Bu e-posta zaten kayıtlı" };

  const ref = db.collection("members").doc();
  await ref.set(
    {
      fullName,
      email,
      emailLower,
      role,
      cinsiyet: String(data?.cinsiyet ?? "").trim(),
      unvan: String(data?.unvan ?? "").trim(),
      gorevyeri: String(data?.gorevyeri ?? "").trim(),
      gorevyeriIl: String(data?.gorevyeriIl ?? "").trim(),
      kurum: String(data?.kurum ?? "").trim(),
      uyeno: String(data?.uyeno ?? "").trim(),
      uyetarih: normalizeUyeTarih(data?.uyetarih),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { ok: true, docId: ref.id };
}

async function updateMemberInFirebase(docId, patch) {
  const db = initFirebase();
  if (!db) return { ok: false, reason: "Firebase aktif değil" };
  const ref = db.collection("members").doc(String(docId));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "Üye bulunamadı" };

  const next = { ...patch };
  if (next.email !== undefined) {
    const email = String(next.email || "").trim();
    if (!email) return { ok: false, reason: "E-posta boş olamaz" };
    next.email = email;
    next.emailLower = email.toLowerCase();
  }
  if (next.fullName !== undefined) next.fullName = normalizeFullName(next.fullName);
  if (next.role !== undefined) next.role = String(next.role || "").trim().toLowerCase() === "admin" ? "admin" : "uye";
  for (const k of ["cinsiyet", "unvan", "gorevyeri", "gorevyeriIl", "kurum", "uyeno"]) {
    if (next[k] !== undefined) next[k] = String(next[k] || "").trim();
  }
  if (next.uyetarih !== undefined) next.uyetarih = normalizeUyeTarih(next.uyetarih);

  await ref.set({ ...next, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
}

async function deleteMemberInFirebase(docId) {
  const db = initFirebase();
  if (!db) return { ok: false, reason: "Firebase aktif değil" };
  const ref = db.collection("members").doc(String(docId));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "Üye bulunamadı" };
  await ref.delete();
  return { ok: true };
}

async function getMembersCountFromFirebase() {
  const db = initFirebase();
  if (!db) return null;
  const col = db.collection("members");
  if (typeof col.count === "function") {
    const agg = await col.count().get();
    return Number(agg.data().count || 0);
  }
  const snap = await col.get();
  return snap.size;
}

function getThisMonthIsoRange() {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const startISO = start.toISOString().slice(0, 10); // YYYY-MM-DD
  const nextISO = next.toISOString().slice(0, 10);
  return { startISO, nextISO };
}

async function getMonthlyNewCountFromFirebase() {
  const db = initFirebase();
  if (!db) return null;
  const { startISO, nextISO } = getThisMonthIsoRange();

  // uyetarih is stored as ISO string (YYYY-MM-DD). Lexicographical range works.
  const snap = await db
    .collection("members")
    .where("uyetarih", ">=", startISO)
    .where("uyetarih", "<", nextISO)
    .get();
  return snap.size;
}

function normalizeDistrictLabel(v) {
  const s = String(v || "").trim();
  if (!s) return "Bilinmiyor";
  // Keep Turkish chars; just normalize whitespace/casing a bit.
  const up = s.toLocaleUpperCase("tr-TR").replace(/\s+/g, " ");
  if (up === "BİLECİK") return "Bilecik Merkez";
  return up
    .toLocaleLowerCase("tr-TR")
    .replace(/(^|\s)([a-zçğıöşü])/g, (m, a, b) => a + b.toLocaleUpperCase("tr-TR"));
}

async function getDistrictDistributionFromFirebase() {
  const db = initFirebase();
  if (!db) return null;
  const snap = await db.collection("members").get();
  const map = new Map();
  for (const doc of snap.docs) {
    const d = doc.data() || {};
    const label = normalizeDistrictLabel(d.gorevyeriIl);
    map.set(label, (map.get(label) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "tr-TR"));
}

function parseMemberDateToMillis(v) {
  const s = String(v || "").trim();
  if (!s) return 0;
  // YYYY-MM-DD
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m1) {
    const d = new Date(`${m1[1]}-${m1[2]}-${m1[3]}T00:00:00Z`);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  // DD.MM.YYYY
  const m2 = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m2) {
    const dd = String(m2[1]).padStart(2, "0");
    const mm = String(m2[2]).padStart(2, "0");
    const yyyy = m2[3];
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : 0;
}

async function getRecentMembersFromFirebase(limit = 4) {
  const db = initFirebase();
  if (!db) return null;
  const snap = await db.collection("members").get();
  const items = snap.docs
    .map((doc) => {
      const d = doc.data() || {};
      return {
        fullName: String(d.fullName ?? "").trim(),
        gorevyeri: String(d.gorevyeri ?? "").trim(),
        kurum: String(d.kurum ?? "").trim(),
        uyetarih: String(d.uyetarih ?? "").trim(),
      };
    })
    .filter((m) => m.fullName)
    .sort((a, b) => parseMemberDateToMillis(b.uyetarih) - parseMemberDateToMillis(a.uyetarih));
  return items.slice(0, Math.max(1, Number(limit) || 4));
}

async function getMemberProfileByIdFromFirebase(id) {
  const db = initFirebase();
  if (!db) return null;
  const key = String(id || "").trim();
  if (!key) return null;

  // 1) First try by Firestore document id (works when we store no explicit `id` field)
  const byDocId = await db.collection("members").doc(key).get();
  if (byDocId.exists) return memberProfileFromDoc(byDocId);

  // 2) Fallback: try by explicit `id` field (works for legacy data where `id` is stored)
  const q = await db.collection("members").where("id", "==", key).limit(1).get();
  if (!q.empty) return memberProfileFromDoc(q.docs[0]);

  return null;
}

async function getAnnouncementsFromFirebase(limit = 50) {
  const db = initFirebase();
  if (!db) return null;
  const snap = await db.collection("announcements").orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getAnnouncementsCountFromFirebase() {
  const db = initFirebase();
  if (!db) return 0;
  const coll = db.collection("announcements");
  try {
    const out = await coll.count().get();
    return Number(out?.data()?.count || 0);
  } catch {
    const snap = await coll.get();
    return snap.size;
  }
}

/**
 * En eski duyurulardan `deleteCount` adet siler.
 * createdAt eksikse: tam `get()` + bellek sıralamasına düşer.
 * @returns {Promise<{ deleted: number; requested: number; deletedIds: string[] }>}
 */
async function pruneOldestAnnouncements(deleteCount) {
  const db = initFirebase();
  if (!db) return { deleted: 0, requested: Math.max(0, Number(deleteCount) || 0), deletedIds: [] };
  const n = Math.max(0, Number(deleteCount) || 0);
  if (n <= 0) return { deleted: 0, requested: 0, deletedIds: [] };
  const coll = db.collection("announcements");

  const createdMillis = (doc) => {
    const ca = doc.data()?.createdAt;
    if (!ca) return 0;
    if (typeof ca.toMillis === "function") return ca.toMillis();
    if (typeof ca.seconds === "number") return ca.seconds * 1000 + Math.floor((ca.nanoseconds || 0) / 1e6);
    if (ca instanceof Date) return ca.getTime();
    return 0;
  };

  let docs = [];
  try {
    const q = await coll.orderBy("createdAt", "asc").limit(n).get();
    docs = q.docs || [];
    if (docs.length < n) throw new Error("orderBy eksik (createdAt yok olabilir)");
  } catch {
    const snap = await coll.get();
    docs = [...(snap.docs || [])].sort((a, b) => createdMillis(a) - createdMillis(b)).slice(0, n);
  }

  const deletedIds = [];
  let deleted = 0;
  for (const d of docs) {
    const id = d.id;
    const ok = await deleteAnnouncementInFirebase(id);
    if (ok) {
      deleted += 1;
      deletedIds.push(id);
    }
  }
  return { deleted, requested: n, deletedIds };
}

/** @returns {Promise<{ id: string; pruned: number } | null>} */
async function createAnnouncementInFirebase({ title, body, createdBy, imageUrl, imagePublicId }) {
  const db = initFirebase();
  if (!db) return null;
  const dateISO = new Date().toISOString().slice(0, 10);
  const payload = {
    title,
    body,
    dateISO,
    createdBy,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const iu = String(imageUrl || "").trim();
  const ip = String(imagePublicId || "").trim();
  if (iu) payload.imageUrl = iu;
  if (ip) payload.imagePublicId = ip;
  const docRef = await db.collection("announcements").add(payload);
  const newId = docRef.id;
  console.log("[announcements] duyuru kaydı tamam", { id: newId });
  return { id: newId, pruned: 0 };
}

async function deleteAnnouncementInFirebase(id) {
  const db = initFirebase();
  if (!db) return false;
  const docRef = db.collection("announcements").doc(String(id));
  const snap = await docRef.get();
  if (!snap.exists) return false;
  const data = snap.data() || {};
  const publicId = String(data.imagePublicId || "").trim();
  // Önce Firestore silinsin; Cloudinary destroy yavaş/hata verirse silme bloklanmasın.
  await docRef.delete();
  if (publicId) {
    Promise.resolve(destroyCloudinaryAsset(publicId)).catch((e) =>
      console.error("[announcements] Cloudinary destroy (arkaplan):", e?.message || e),
    );
  }
  return true;
}

async function updateAnnouncementInFirebase(id, { title, body, imageUrl, imagePublicId }) {
  const db = initFirebase();
  if (!db) return false;
  const docRef = db.collection("announcements").doc(String(id));
  const snap = await docRef.get();
  if (!snap.exists) return false;
  const prev = snap.data() || {};
  const prevPublicId = String(prev.imagePublicId || "").trim();

  const next = {
    title: String(title || "").trim(),
    body: String(body || "").trim(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!next.title || !next.body) return false;

  // Image update is optional. If provided, overwrite fields and delete old Cloudinary asset if publicId changed.
  const iu = imageUrl === undefined ? undefined : String(imageUrl || "").trim();
  const ip = imagePublicId === undefined ? undefined : String(imagePublicId || "").trim();
  if (iu !== undefined) next.imageUrl = iu || admin.firestore.FieldValue.delete();
  if (ip !== undefined) next.imagePublicId = ip || admin.firestore.FieldValue.delete();

  await docRef.set(next, { merge: true });

  const newPublicId = ip !== undefined ? ip : prevPublicId;
  if (prevPublicId && newPublicId && prevPublicId !== newPublicId) {
    Promise.resolve(destroyCloudinaryAsset(prevPublicId)).catch((e) =>
      console.error("[announcements] Cloudinary destroy (edit arkaplan):", e?.message || e),
    );
  }
  return true;
}

async function getNewsFromFirebase(limit = 50) {
  const db = initFirebase();
  if (!db) return null;
  const snap = await db.collection("news").orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function createNewsInFirebase({ title, summary, createdBy }) {
  const db = initFirebase();
  if (!db) return null;
  const dateISO = new Date().toISOString().slice(0, 10);
  const doc = await db.collection("news").add({
    title,
    summary,
    dateISO,
    createdBy,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return doc.id;
}

async function updateNewsInFirebase(id, { title, summary }) {
  const db = initFirebase();
  if (!db) return false;
  const docRef = db.collection("news").doc(String(id));
  const snap = await docRef.get();
  if (!snap.exists) return false;
  const next = {};
  if (title !== undefined) next.title = String(title || "").trim();
  if (summary !== undefined) next.summary = String(summary || "").trim();
  if (!next.title || !next.summary) return false;
  next.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await docRef.set(next, { merge: true });
  return true;
}

async function deleteNewsInFirebase(id) {
  const db = initFirebase();
  if (!db) return false;
  const docRef = db.collection("news").doc(String(id));
  const snap = await docRef.get();
  if (!snap.exists) return false;
  await docRef.delete();
  return true;
}

async function updatePasswordHashInFirebase(email, passwordHash) {
  const db = initFirebase();
  if (!db) return false;
  const emailLower = String(email || "").trim().toLowerCase();
  const q = await db.collection("members").where("emailLower", "==", emailLower).limit(1).get();
  if (q.empty) return false;
  await q.docs[0].ref.set({ passwordHash, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return true;
}

async function getMembers() {
  if (firebaseEnabled()) {
    try {
      const m = await getMembersFromFirebase();
      return m ?? loadMembers();
    } catch (e) {
      console.error("Firebase load failed, falling back to JSON:", e?.message || e);
      return loadMembers();
    }
  }
  return loadMembers();
}

// OTP store: email -> { codeHash, expiresAtMs }
const otpStore = new Map();

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest();
}

function makePasswordHash(password) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(String(password), salt, 64);
  return `${salt.toString("hex")}:${dk.toString("hex")}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const [saltHex, dkHex] = stored.split(":");
  if (!saltHex || !dkHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const actual = Buffer.from(dkHex, "hex");
  const given = crypto.scryptSync(String(password), salt, actual.length);
  return actual.length === given.length && crypto.timingSafeEqual(actual, given);
}

function generateOtp() {
  // 6-digit numeric code
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    /** Uygulama doğrudan Firestore’a değil; önce bu API’ye gelir. */
    firebaseConfigured: firebaseEnabled(),
    cloudinaryConfigured: cloudinaryConfigured(),
  });
});

app.get("/me", (req, res) => {
  (async () => {
    const token = getBearer(req);
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ ok: false, reason: "Yetkisiz" });
    if (!firebaseEnabled()) return res.status(400).json({ ok: false, reason: "Firebase aktif değil" });

    const profile = await getMemberProfileByIdFromFirebase(payload.sub);
    if (!profile) return res.status(404).json({ ok: false, reason: "Üye bulunamadı" });
    return res.json({ ok: true, profile });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.get("/stats/members-count", (_req, res) => {
  (async () => {
    if (!firebaseEnabled()) return res.json({ ok: true, count: 0 });
    const count = await getMembersCountFromFirebase();
    return res.json({ ok: true, count: Number(count || 0) });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.get("/stats/monthly-new", (_req, res) => {
  (async () => {
    if (!firebaseEnabled()) return res.json({ ok: true, count: 0 });
    const count = await getMonthlyNewCountFromFirebase();
    return res.json({ ok: true, count: Number(count || 0) });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.get("/stats/districts", (_req, res) => {
  (async () => {
    if (!firebaseEnabled()) return res.json({ ok: true, items: [] });
    const items = await getDistrictDistributionFromFirebase();
    return res.json({ ok: true, items: Array.isArray(items) ? items : [] });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.get("/stats/recent-members", (req, res) => {
  (async () => {
    if (!firebaseEnabled()) return res.json({ ok: true, items: [] });
    const limit = Math.max(1, Math.min(20, Number(req.query?.limit || 4) || 4));
    const items = await getRecentMembersFromFirebase(limit);
    return res.json({ ok: true, items: Array.isArray(items) ? items : [] });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.get("/admin/members", (req, res) => {
  (async () => {
    const auth = requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, reason: auth.reason });
    if (!firebaseEnabled()) return res.status(400).json({ ok: false, reason: "Firebase aktif değil" });

    const q = String(req.query?.q ?? "").trim().toLowerCase();
    const limit = Math.max(1, Math.min(50, Number(req.query?.limit || 20) || 20));
    if (!q) return res.json({ ok: true, items: [] });

    const items = (await searchMembersAdminFromFirebase(q, limit)) || [];
    return res.json({ ok: true, items });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.post("/admin/members", (req, res) => {
  (async () => {
    const auth = requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, reason: auth.reason });
    if (!firebaseEnabled()) return res.status(400).json({ ok: false, reason: "Firebase aktif değil" });

    const result = await createMemberInFirebase(req.body);
    if (!result?.ok) return res.status(400).json({ ok: false, reason: result?.reason ?? "Geçersiz istek" });
    return res.json({ ok: true, docId: result.docId });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.patch("/admin/members/:id", (req, res) => {
  (async () => {
    const auth = requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, reason: auth.reason });
    if (!firebaseEnabled()) return res.status(400).json({ ok: false, reason: "Firebase aktif değil" });

    const result = await updateMemberInFirebase(req.params.id, req.body || {});
    if (!result?.ok) return res.status(400).json({ ok: false, reason: result?.reason ?? "Güncellenemedi" });
    return res.json({ ok: true });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.delete("/admin/members/:id", (req, res) => {
  (async () => {
    const auth = requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, reason: auth.reason });
    if (!firebaseEnabled()) return res.status(400).json({ ok: false, reason: "Firebase aktif değil" });

    if (String(auth.payload.sub) === String(req.params.id)) {
      return res.status(400).json({ ok: false, reason: "Kendi hesabınızı silemezsiniz" });
    }

    const result = await deleteMemberInFirebase(req.params.id);
    if (!result?.ok) return res.status(400).json({ ok: false, reason: result?.reason ?? "Silinemedi" });
    return res.json({ ok: true });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.post("/auth/login", (req, res) => {
  const fullName = normalizeFullName(req.body?.fullName);
  const password = String(req.body?.password || "");
  if (!fullName) return res.status(400).json({ ok: false, reason: "fullName gerekli" });

  (async () => {
    const members = await getMembers();
    const member = members.find((m) => normalizeFullName(m.fullName) === fullName);
    if (!member) return res.status(401).json({ ok: false, reason: "Üye bulunamadı." });

    if (!member.passwordHash) {
      return res.status(401).json({
        ok: false,
        reason: "Şifre tanımlı değil. Şifre sıfırlama ile şifre oluşturabilirsiniz.",
        email: member.email,
      });
    }

    if (!verifyPassword(password, member.passwordHash)) {
      return res.status(401).json({ ok: false, reason: "Şifre hatalı." });
    }

    return res.json({
      ok: true,
      user: { id: member.id, fullName: member.fullName, email: member.email, role: member.role },
      token: signToken({
        sub: member.id,
        fullName: member.fullName,
        role: member.role,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 gün
      }),
    });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.get("/announcements", (_req, res) => {
  (async () => {
    if (!firebaseEnabled()) return res.json({ ok: true, items: [] });
    const items = (await getAnnouncementsFromFirebase(50)) || [];
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    return res.json({ ok: true, items });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.get("/announcements/count", (req, res) => {
  (async () => {
    const auth = requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, reason: auth.reason });
    if (!firebaseEnabled()) return res.json({ ok: true, count: 0 });
    const count = await getAnnouncementsCountFromFirebase();
    return res.json({ ok: true, count: Number(count || 0) });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

// Backward-compat / typo-tolerant alias (some clients logged /annoucements/*)
app.get("/annoucements/count", (req, res) => {
  (async () => {
    const auth = requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, reason: auth.reason });
    if (!firebaseEnabled()) return res.json({ ok: true, count: 0 });
    const count = await getAnnouncementsCountFromFirebase();
    return res.json({ ok: true, count: Number(count || 0) });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.post("/announcements/prune-oldest", (req, res) => {
  (async () => {
    const auth = requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, reason: auth.reason });
    if (!firebaseEnabled()) return res.status(400).json({ ok: false, reason: "Firebase aktif değil" });
    const deleteCount = Math.max(0, Math.min(100, Number(req.body?.deleteCount || 0) || 0));
    if (!deleteCount) return res.json({ ok: true, deleted: 0, requested: 0, deletedIds: [] });
    const out = await pruneOldestAnnouncements(deleteCount);
    return res.json({ ok: true, ...out });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

// Backward-compat / typo-tolerant alias
app.post("/annoucements/prune-oldest", (req, res) => {
  (async () => {
    const auth = requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, reason: auth.reason });
    if (!firebaseEnabled()) return res.status(400).json({ ok: false, reason: "Firebase aktif değil" });
    const deleteCount = Math.max(0, Math.min(100, Number(req.body?.deleteCount || 0) || 0));
    if (!deleteCount) return res.json({ ok: true, deleted: 0, requested: 0, deletedIds: [] });
    const out = await pruneOldestAnnouncements(deleteCount);
    return res.json({ ok: true, ...out });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.post(
  "/admin/upload/announcement-image",
  (req, res, next) => {
    const auth = requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, reason: auth.reason });
    if (!cloudinaryConfigured()) {
      return res.status(503).json({ ok: false, reason: "Cloudinary yapılandırılmamış (CLOUDINARY_* env)" });
    }
    next();
  },
  (req, res, next) => {
    announcementImageUpload.single("image")(req, res, (err) => {
      if (err) return res.status(400).json({ ok: false, reason: err.message || "Dosya yüklenemedi" });
      next();
    });
  },
  (req, res) => {
    (async () => {
      if (!req.file?.buffer) return res.status(400).json({ ok: false, reason: "Dosya gerekli" });
      const uploaded = await uploadAnnouncementImageToCloudinary(req.file.buffer, req.file.mimetype);
      return res.json({ ok: true, url: uploaded.secure_url, publicId: uploaded.public_id });
    })().catch((e) => {
      const msg =
        e?.error?.message ||
        e?.message ||
        (e && typeof e === "object" && e.error ? JSON.stringify(e.error) : "") ||
        String(e || "bilinmeyen");
      const code = e?.http_code || e?.error?.http_code || "";
      console.error("[upload/announcement-image]", msg, code);
      return res.status(500).json({
        ok: false,
        reason: "Görsel yüklenemedi",
        detail: String(msg || "Bilinmeyen hata"),
      });
    });
  },
);

app.post("/announcements", (req, res) => {
  (async () => {
    const token = getBearer(req);
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ ok: false, reason: "Yetkisiz" });
    if (payload.role !== "admin") return res.status(403).json({ ok: false, reason: "Yetki yok" });

    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    if (!title || !body) return res.status(400).json({ ok: false, reason: "Başlık ve mesaj gerekli" });

    const imageUrl = String(req.body?.imageUrl || "").trim();
    const imagePublicId = String(req.body?.imagePublicId || "").trim();
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
      return res.status(400).json({ ok: false, reason: "Geçersiz görsel adresi" });
    }

    console.log("[announcements] POST /announcements — duyuru kaydediliyor:", title.slice(0, 60));

    const created = await createAnnouncementInFirebase({
      title,
      body,
      createdBy: { id: payload.sub, fullName: payload.fullName },
      imageUrl: imageUrl || undefined,
      imagePublicId: imagePublicId || undefined,
    });
    if (!created?.id) return res.status(500).json({ ok: false, reason: "Kayıt yapılamadı" });
    return res.json({ ok: true, id: created.id, pruned: created.pruned ?? 0 });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.patch("/announcements/:id", (req, res) => {
  (async () => {
    const auth = requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, reason: auth.reason });

    if (!firebaseEnabled()) return res.status(400).json({ ok: false, reason: "Firebase aktif değil" });
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, reason: "id gerekli" });

    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    if (!title || !body) return res.status(400).json({ ok: false, reason: "Başlık ve mesaj gerekli" });

    const imageUrl = req.body?.imageUrl === undefined ? undefined : String(req.body?.imageUrl || "").trim();
    const imagePublicId = req.body?.imagePublicId === undefined ? undefined : String(req.body?.imagePublicId || "").trim();
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
      return res.status(400).json({ ok: false, reason: "Geçersiz görsel adresi" });
    }

    const ok = await updateAnnouncementInFirebase(id, { title, body, imageUrl, imagePublicId });
    if (!ok) return res.status(404).json({ ok: false, reason: "Duyuru bulunamadı" });
    return res.json({ ok: true });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.delete("/announcements/:id", (req, res) => {
  (async () => {
    const token = getBearer(req);
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ ok: false, reason: "Yetkisiz" });
    if (payload.role !== "admin") return res.status(403).json({ ok: false, reason: "Yetki yok" });

    if (!firebaseEnabled()) return res.status(400).json({ ok: false, reason: "Firebase aktif değil" });
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, reason: "id gerekli" });

    const ok = await deleteAnnouncementInFirebase(id);
    if (!ok) return res.status(404).json({ ok: false, reason: "Duyuru bulunamadı" });
    return res.json({ ok: true });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.get("/news", (_req, res) => {
  (async () => {
    if (!firebaseEnabled()) return res.json({ ok: true, items: [] });
    const items = (await getNewsFromFirebase(50)) || [];
    return res.json({ ok: true, items });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.post("/news", (req, res) => {
  (async () => {
    const token = getBearer(req);
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ ok: false, reason: "Yetkisiz" });
    if (payload.role !== "admin") return res.status(403).json({ ok: false, reason: "Yetki yok" });

    const title = String(req.body?.title || "").trim();
    const summary = String(req.body?.summary || "").trim();
    if (!title || !summary) return res.status(400).json({ ok: false, reason: "Başlık ve özet gerekli" });

    const id = await createNewsInFirebase({
      title,
      summary,
      createdBy: { id: payload.sub, fullName: payload.fullName },
    });
    if (!id) return res.status(500).json({ ok: false, reason: "Kayıt yapılamadı" });
    return res.json({ ok: true, id });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.patch("/news/:id", (req, res) => {
  (async () => {
    const token = getBearer(req);
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ ok: false, reason: "Yetkisiz" });
    if (payload.role !== "admin") return res.status(403).json({ ok: false, reason: "Yetki yok" });

    if (!firebaseEnabled()) return res.status(400).json({ ok: false, reason: "Firebase aktif değil" });
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, reason: "id gerekli" });

    const title = String(req.body?.title || "").trim();
    const summary = String(req.body?.summary || "").trim();
    if (!title || !summary) return res.status(400).json({ ok: false, reason: "Başlık ve özet gerekli" });

    const ok = await updateNewsInFirebase(id, { title, summary });
    if (!ok) return res.status(404).json({ ok: false, reason: "Haber bulunamadı" });
    return res.json({ ok: true });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.delete("/news/:id", (req, res) => {
  (async () => {
    const token = getBearer(req);
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ ok: false, reason: "Yetkisiz" });
    if (payload.role !== "admin") return res.status(403).json({ ok: false, reason: "Yetki yok" });

    if (!firebaseEnabled()) return res.status(400).json({ ok: false, reason: "Firebase aktif değil" });
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, reason: "id gerekli" });

    const ok = await deleteNewsInFirebase(id);
    if (!ok) return res.status(404).json({ ok: false, reason: "Haber bulunamadı" });
    return res.json({ ok: true });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.post("/auth/request-reset", async (req, res) => {
  const fullName = normalizeFullName(req.body?.fullName);
  if (!fullName) return res.status(400).json({ ok: false, reason: "fullName gerekli" });

  const members = await getMembers();
  const member = members.find((m) => normalizeFullName(m.fullName) === fullName);
  // Güvenlik: kullanıcı var/yok bilgisini dışarı sızdırma
  if (!member?.email) return res.json({ ok: true });

  const code = generateOtp();
  const expiresAtMs = Date.now() + 10 * 60 * 1000; // 10 dk
  otpStore.set(member.email.toLowerCase(), { codeHash: hashCode(code), expiresAtMs });

  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[DEV] OTP for ${member.email}: ${code}`);
    return res.json({ ok: true, dev: true });
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = "Şifre Sıfırlama Kodu - Türk Eğitim-Sen Bilecik";
  const text = `Merhaba,\n\nŞifre sıfırlama kodunuz: ${code}\n\nKod 10 dakika geçerlidir.\nEğer bu işlemi siz yapmadıysanız bu e-postayı dikkate almayın.\n`;

  await transporter.sendMail({
    from,
    to: member.email,
    subject,
    text,
  });

  return res.json({ ok: true });
});

app.post("/auth/reset-password", (req, res) => {
  const fullName = normalizeFullName(req.body?.fullName);
  const code = String(req.body?.code || "").trim();
  const newPassword = String(req.body?.newPassword || "");

  if (!fullName || !code || !newPassword) {
    return res.status(400).json({ ok: false, reason: "fullName, code, newPassword gerekli" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ ok: false, reason: "Şifre en az 6 karakter olmalı" });
  }

  (async () => {
    const members = await getMembers();
    const member = members.find((m) => normalizeFullName(m.fullName) === fullName);
    // Güvenlik: var/yok aynı mesaj
    if (!member?.email) return res.status(400).json({ ok: false, reason: "Kod geçersiz veya süresi doldu" });

    const key = member.email.toLowerCase();
    const entry = otpStore.get(key);
    if (!entry || Date.now() > entry.expiresAtMs) {
      otpStore.delete(key);
      return res.status(400).json({ ok: false, reason: "Kod geçersiz veya süresi doldu" });
    }

    const actual = entry.codeHash;
    const given = hashCode(code);
    const ok = actual.length === given.length && crypto.timingSafeEqual(actual, given);
    if (!ok) return res.status(400).json({ ok: false, reason: "Kod geçersiz veya süresi doldu" });

    otpStore.delete(key);

    const passwordHash = makePasswordHash(newPassword);

    if (firebaseEnabled()) {
      const updated = await updatePasswordHashInFirebase(member.email, passwordHash);
      if (!updated) return res.status(500).json({ ok: false, reason: "Şifre güncellenemedi" });
      return res.json({ ok: true });
    }

    // Fallback: JSON file
    const fileMembers = loadMembers();
    const fileMember = fileMembers.find((m) => normalizeFullName(m.fullName) === fullName);
    if (fileMember) {
      fileMember.passwordHash = passwordHash;
      saveMembers(fileMembers);
    }
    return res.json({ ok: true });
  })().catch(() => res.status(500).json({ ok: false, reason: "Sunucu hatası" }));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`  → http://localhost:${PORT}/  (API bilgisi)  |  http://localhost:${PORT}/health`);
  if (firebaseEnabled()) {
    console.log("[config] Firestore: FIREBASE_* tanımlı (veri bu hesap üzerinden okunur).");
  } else {
    console.warn(
      "[config] Firestore: KAPALI — server/.env içinde FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY eksik. İstatistikler 0 / boş döner.",
    );
  }
  if (cloudinaryConfigured()) console.log("[config] Cloudinary: aktif");
  else console.warn("[config] Cloudinary: kapalı (duyuru görseli yüklenmez).");
});

