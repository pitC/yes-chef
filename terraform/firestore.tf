resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.firestore_location # must be nam5 per live describe
  type        = "FIRESTORE_NATIVE"

  # Never destroy Firestore via TF
  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.services]
}

# Firestore rules are managed via `firebase deploy --only firestore:rules` or a terraform_data local-exec provisioner.
# The rules file is `firestore.rules` at repo root — allowlist for established collection deafening-gnarly-dining.
# See firestore.rules for allow read,write on established collection and deny on {other=**}.
