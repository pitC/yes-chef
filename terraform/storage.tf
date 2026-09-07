# Static hosting — Option A: Public bucket website (no LB, no CDN, no cert)
resource "google_storage_bucket" "static" {
  name          = var.bucket_name
  location      = var.region
  force_destroy = false
  uniform_bucket_level_access = true

  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html"
  }

  cors {
    origin          = ["https://storage.googleapis.com", "http://localhost:8000", "http://localhost:3000"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type", "Access-Control-Allow-Origin"]
    max_age_seconds = 3600
  }

  labels = {
    app = "yes-chef"
  }

  depends_on = [google_project_service.services]
}

resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.static.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# Note: objects are deployed via `gcloud storage rsync` from `public/` (including generated public/js/firebase-config.js),
# not via google_storage_bucket_object — for large syncs rsync is simpler.
# `public/js/firebase-config.js` is generated from Secret Manager `firebase-config` at deploy time (see secrets.tf).
