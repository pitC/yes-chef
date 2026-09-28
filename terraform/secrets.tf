# Secret Manager secrets — never committed; injected at deploy

resource "google_secret_manager_secret" "firebase_config" {
  secret_id = "firebase-config"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

# Optionally populate via `gcloud secrets versions add` — not via TF (to avoid TF_VAR leakage):
# echo -n '{"apiKey":"...","authDomain":"yes-chef-cookbook.firebaseapp.com","projectId":"yes-chef-cookbook","storageBucket":"...","messagingSenderId":"158345618336","appId":"1:..."}' | gcloud secrets versions add firebase-config --data-file=- --project=yes-chef-cookbook

# Grant Cloud Run SA access to secrets
resource "google_secret_manager_secret_iam_member" "firebase_config_accessor" {
  secret_id = google_secret_manager_secret.firebase_config.secret_id
  project   = google_secret_manager_secret.firebase_config.project
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

# Service-user credentials for Firestore server auth (see
# docs/firestore_security_strategy.md). The backend signs into Firebase Auth
# as this user; Firestore rules allow traffic only from its `isServer` claim.
# Populate out-of-band (never in TF):
#   printf '%s' '<service-user-email-from-console>' \
#     | gcloud secrets versions add server-auth-email --data-file=- --project=yes-chef-cookbook
#   openssl rand -base64 32 \
#     | gcloud secrets versions add server-auth-password --data-file=- --project=yes-chef-cookbook
# (Set the same password on the Firebase Auth user when creating it.)
resource "google_secret_manager_secret" "server_auth_email" {
  secret_id = "server-auth-email"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret" "server_auth_password" {
  secret_id = "server-auth-password"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_iam_member" "server_auth_email_accessor" {
  secret_id = google_secret_manager_secret.server_auth_email.secret_id
  project   = google_secret_manager_secret.server_auth_email.project
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

resource "google_secret_manager_secret_iam_member" "server_auth_password_accessor" {
  secret_id = google_secret_manager_secret.server_auth_password.secret_id
  project   = google_secret_manager_secret.server_auth_password.project
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}
