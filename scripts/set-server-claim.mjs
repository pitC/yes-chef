#!/usr/bin/env node
// One-off: grant the Firestore service user its `isServer` custom claim.
//
// The backend signs in as this user with the Firebase *client* SDK; Firestore
// rules allow traffic only from identities carrying `isServer == true`.
// Firebase Console cannot set custom claims, so this script does it once via
// the Admin SDK. It is NOT part of the server runtime (which stays on the
// client SDK by design) — run it once and forget it.
//
// Prerequisites:
//   1. Firebase Auth → Sign-in method → enable Email/Password (console, once).
//   2. Firebase Auth → Users → Add user (the service user), copy its UID.
//   3. Application Default Credentials with Firebase Auth admin rights:
//        gcloud auth application-default login
//   4. Repo deps installed (`npm install` at repo root — `firebase-admin`
//      is a devDependency for this script; it never ships to client/server).
//
// Usage (from repo root):
//   node scripts/set-server-claim.mjs <USER_UID> [--project yes-chef-cookbook]
//
// No ADC in this environment? Fallback without firebase-admin — set the claim
// via Identity Toolkit REST with gcloud user credentials:
//   T=$(gcloud auth print-access-token)
//   curl -s -X POST "https://identitytoolkit.googleapis.com/v1/projects/<PROJECT>/accounts:update" \
//     -H "Authorization: Bearer $T" -H "x-goog-user-project: <PROJECT>" \
//     -H "Content-Type: application/json" \
//     -d '{"localId":"<USER_UID>","customAttributes":"{\"isServer\":true}"}'
// Verify:
//   curl -s -X POST "https://identitytoolkit.googleapis.com/v1/projects/<PROJECT>/accounts:lookup" \
//     -H "Authorization: Bearer $T" -H "x-goog-user-project: <PROJECT>" \
//     -H "Content-Type: application/json" \
//     -d '{"localId":["<USER_UID>"]}' | grep -o '"customAttributes": "[^"]*"'
//
// Verify afterwards:
//   (re-authenticate the user or wait ≤1h for token refresh; rules read the
//   claim from the ID token, so the server must sign in AFTER this runs.)

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const uid = process.argv[2];
const projectFlag = process.argv.indexOf("--project");
const projectId =
  (projectFlag !== -1 && process.argv[projectFlag + 1]) ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  "yes-chef-cookbook";

if (!uid || uid.startsWith("--")) {
  console.error("Usage: node scripts/set-server-claim.mjs <USER_UID> [--project <id>]");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });

await getAuth().setCustomUserClaims(uid, { isServer: true });
const updated = await getAuth().getUser(uid);
console.log(`Set custom claims for ${updated.email || uid}:`, updated.customClaims);
