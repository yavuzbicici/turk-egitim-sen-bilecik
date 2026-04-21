/**
 * One-off: Firestore announcement doc id -> Cloudinary stored bytes.
 * Usage: node scripts/lookupAnnouncementImageBytes.js XXSrdGLIhYOjBZPnZpMc
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const admin = require("firebase-admin");
const cloudinary = require("cloudinary").v2;

const docId = String(process.argv[2] || "").trim();
if (!docId) {
  console.error("Usage: node scripts/lookupAnnouncementImageBytes.js <firestore_announcement_doc_id>");
  process.exit(1);
}

function initFirebase() {
  if (admin.apps.length) return admin.firestore();
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    console.error("Firebase env eksik.");
    process.exit(1);
  }
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
  return admin.firestore();
}

function initCloudinary() {
  delete process.env.CLOUDINARY_URL;
  cloudinary.config(true);
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

(async () => {
  const db = initFirebase();
  initCloudinary();

  const snap = await db.collection("announcements").doc(docId).get();
  if (!snap.exists) {
    console.log("Firestore: bu id ile duyuru yok.");
    process.exit(0);
  }
  const d = snap.data() || {};
  const pid = String(d.imagePublicId || "").trim();
  const url = String(d.imageUrl || "").trim();
  console.log("Firestore doc:", docId);
  console.log("imagePublicId:", pid || "(yok)");
  console.log("imageUrl:", url ? url.slice(0, 100) + (url.length > 100 ? "…" : "") : "(yok)");

  if (!pid) {
    console.log("Bu duyuruda Cloudinary public_id yok; görsel yüklenmemiş olabilir.");
    process.exit(0);
  }

  try {
    const r = await cloudinary.api.resource(pid, { resource_type: "image" });
    const b = Number(r.bytes) || 0;
    console.log("Cloudinary depolama (orijinal yükleme):", b, "bayt");
    console.log("  ≈", (b / 1024).toFixed(1), "KiB,", (b / 1024 / 1024).toFixed(3), "MiB");
    console.log("format:", r.format, "piksel:", `${r.width}x${r.height}`);
  } catch (e) {
    console.error("Cloudinary:", e.error?.message || e.message);
    process.exit(1);
  }
})();
