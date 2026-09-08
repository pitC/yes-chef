import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  DocumentReference,
  CollectionReference,
} from "firebase/firestore";

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;

function getFirebaseConfig() {
  // Try JSON env first (Secret Manager)
  const json = process.env.FIREBASE_CONFIG_JSON || process.env.FIREBASE_CONFIG || "";
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (parsed.apiKey && parsed.projectId) return parsed;
    } catch {}
  }
  // Fallback to individual env vars or default config (not hardcoded collection)
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "";
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    "yes-chef-cookbook";
  // For local dev, allow fake key if not set — Firestore SDK will still work with rules allow read
  return {
    apiKey: apiKey || "AIzaSyFakeKey_ForLocalDev_NotCommitted_12345",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "158345618336",
    appId: process.env.FIREBASE_APP_ID || "1:158345618336:web:5846633ae0d4d529c13ac5",
  };
}

function initFirestore(): void {
  if (_db) return;
  const config = getFirebaseConfig();
  if (!getApps().length) {
    _app = initializeApp(config);
  } else {
    _app = getApps()[0]!;
  }
  _db = getFirestore(_app);
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    // eslint-disable-next-line no-console
    console.log(`[firestore] Using emulator ${process.env.FIRESTORE_EMULATOR_HOST} project=${config.projectId}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[firestore] Initialized project=${config.projectId} via Firestore SDK`);
  }
}

export function getDb(): Firestore {
  initFirestore();
  return _db!;
}

export function getFirestoreConfig() {
  return getFirebaseConfig();
}

/** Check if a Firestore collection is established (has metadata doc) — used for multi-tenant auth */
export async function isCollectionEstablished(collectionName: string): Promise<boolean> {
  if (!collectionName || !collectionName.trim() || collectionName.includes("/")) return false;
  try {
    const col = collection(getDb(), collectionName.trim());
    const snap = await getDoc(doc(col, "metadata"));
    return snap.exists();
  } catch {
    return false;
  }
}

export function isAuthDisabled(): boolean {
  return process.env.MCP_NO_AUTH === "1" || process.env.MCP_NO_AUTH === "true" || process.env.MCP_AUTH_DISABLED === "1" || process.env.MCP_AUTH_DISABLED === "true";
}

/** Resolve a collection name from a token — if token is a valid collection, return it. */
export async function resolveCollectionFromToken(token: string): Promise<string | null> {
  const cleaned = token.trim().replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("/")) return null;
  if (await isCollectionEstablished(cleaned)) return cleaned;
  return null;
}

// Re-export Firestore helpers for callers that need them (server uses Firestore SDK, not Admin SDK)
export { collection, doc, getDoc, getDocs, setDoc, getFirestore, initializeApp };
export type { CollectionReference, DocumentReference, Firestore };

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
