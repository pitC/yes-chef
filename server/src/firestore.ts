import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
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

// Server identity: the backend signs into Firebase Auth as a dedicated
// service user carrying the `isServer == true` custom claim. Firestore rules
// allow traffic only from that identity, so unauthenticated browsers calling
// the Firestore API directly are denied. The client SDK refreshes the ID
// token automatically for the life of the process.
let _authInit: Promise<void> | null = null;

export function initServerAuth(): Promise<void> {
  if (_authInit) return _authInit;
  _authInit = (async () => {
    if (isAuthDisabled()) {
      // Emulator path: rules/auth are bypassed locally (MCP_NO_AUTH=1).
      // eslint-disable-next-line no-console
      console.log("[firestore] Auth disabled (MCP_NO_AUTH) — skipping server sign-in");
      return;
    }
    const email = (process.env.SERVER_AUTH_EMAIL || "").trim();
    const password = process.env.SERVER_AUTH_PASSWORD || "";
    if (!email || !password) {
      throw new Error(
        "SERVER_AUTH_EMAIL / SERVER_AUTH_PASSWORD are required (or set MCP_NO_AUTH=1 for the local emulator)"
      );
    }
    initFirestore();
    const auth = getAuth(_app!);
    const maxAttempts = 5;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { signInWithEmailAndPassword } = await import("firebase/auth");
        const cred = await signInWithEmailAndPassword(auth, email, password);
        // eslint-disable-next-line no-console
        console.log(`[firestore] Server authenticated as ${cred.user.uid} (service user)`);
        return;
      } catch (e) {
        lastErr = e;
        if (attempt < maxAttempts) {
          const backoffMs = 1000 * 2 ** (attempt - 1);
          // eslint-disable-next-line no-console
          console.log(`[firestore] Sign-in attempt ${attempt}/${maxAttempts} failed, retrying in ${backoffMs}ms`);
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    }
    throw new Error(
      `Server sign-in failed after ${maxAttempts} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
    );
  })();
  return _authInit;
}

/** Test hook: reset cached auth promise (and db) between tests. */
export function _resetAuthForTests(): void {
  _authInit = null;
  _db = null;
  _app = null;
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
