// Copy to public/js/firebase-config.js and fill from Secret Manager `firebase-config`
// This file is generated at deploy time — never commit real key.
// See GCP_MIGRATION_PLAN §6.1 / §8 for generation via:
// gcloud secrets versions access latest --secret=firebase-config --project=yes-chef-cookbook --format="value(payload.data)" | base64 -d > public/js/firebase-config.js

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "yes-chef-cookbook.firebaseapp.com",
  projectId: "yes-chef-cookbook",
  storageBucket: "yes-chef-cookbook.firebasestorage.app",
  messagingSenderId: "158345618336",
  appId: "1:158345618336:web:5846633ae0d4d529c13ac5",
};
