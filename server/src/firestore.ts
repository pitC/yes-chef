import admin from "firebase-admin";

let _db: FirebaseFirestore.Firestore | null = null;
let _initialized = false;

const ESTABLISHED_COLLECTION = "deafening-gnarly-dining";

function initAdmin(): void {
  if (_initialized) return;
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    "demo-yes-chef";

  if (!admin.apps.length) {
    admin.initializeApp({
      projectId,
    });
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      // eslint-disable-next-line no-console
      console.log(`[firestore] Using emulator ${process.env.FIRESTORE_EMULATOR_HOST} project=${projectId}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[firestore] Initialized project=${projectId} collection=${ESTABLISHED_COLLECTION}`);
    }
  }
  _initialized = true;
}

export function getDb(): FirebaseFirestore.Firestore {
  initAdmin();
  if (!_db) {
    _db = admin.firestore();
  }
  return _db;
}

export function getCollectionName(): string {
  // Established collection — no longer env-driven (RECIPES_COLLECTION removed)
  return ESTABLISHED_COLLECTION;
}

export function getEstablishedCollectionName(): string {
  return ESTABLISHED_COLLECTION;
}

/** Token for HTTP auth — backed by MCP_TOKEN (Secret Manager), not collection name */
export function getAuthToken(): string {
  const token = (process.env.MCP_TOKEN || process.env.MCP_AUTH_TOKEN || "").trim();
  if (token) return token;
  // Fallback for local dev / tests when MCP_NO_AUTH not set but no token configured
  // In production, MCP_NO_AUTH should be unset and MCP_TOKEN must be set
  return "";
}

export function isAuthDisabled(): boolean {
  return process.env.MCP_NO_AUTH === "1" || process.env.MCP_NO_AUTH === "true" || process.env.MCP_AUTH_DISABLED === "1" || process.env.MCP_AUTH_DISABLED === "true";
}

export function getCollection(): FirebaseFirestore.CollectionReference {
  return getDb().collection(getCollectionName());
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

export function generateId(title: string): string {
  const base = slugify(title) || "recipe";
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
