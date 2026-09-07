# Secret Manager secrets — never committed; injected at deploy

resource "google_secret_manager_secret" "firebase_config" {
  secret_id = "firebase-config"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret" "mcp_token" {
  secret_id = "mcp-token"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

# Optionally populate via `gcloud secrets versions add` — not via TF (to avoid TF_VAR leakage):
# echo -n '{"apiKey":"...","authDomain":"yes-chef-cookbook.firebaseapp.com","projectId":"yes-chef-cookbook","storageBucket":"...","messagingSenderId":"158345618336","appId":"1:..."}' | gcloud secrets versions add firebase-config --data-file=- --project=yes-chef-cookbook
# echo -n "your-mcp-token" | gcloud secrets versions add mcp-token --data-file=- --project=yes-chef-cookbook

# Grant Cloud Run SA access to secrets
resource "google_secret_manager_secret_iam_member" "firebase_config_accessor" {
  secret_id = google_secret_manager_secret.firebase_config.secret_id
  project   = google_secret_manager_secret.firebase_config.project
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

resource "google_secret_manager_secret_iam_member" "mcp_token_accessor" {
  secret_id = google_secret_manager_secret.mcp_token.secret_id
  project   = google_secret_manager_secret.mcp_token.project
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}
