# Dedicated SA for Cloud Run (optional: use default compute until verified)
resource "google_service_account" "run" {
  account_id   = "yes-chef-run"
  display_name = "Yes Chef Cloud Run SA"
  description  = "Dedicated SA for Cloud Run yes-chef-cookbook (datastore.user)"
  project      = var.project_id
}

resource "google_project_iam_member" "run_datastore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.run.email}"
}

resource "google_project_iam_member" "run_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.run.email}"
}

# No MCP_TOKEN / RECIPES_COLLECTION env vars — auth is per-request cookbook code (collection/metadata)

resource "google_cloud_run_v2_service" "yes_chef" {
  name     = var.run_service_name
  location = var.region
  project  = var.project_id

  template {
    containers {
      # Image built from server/Dockerfile; set via var.image or Cloud Build --source
      image = var.image != "" ? var.image : "europe-west1-docker.pkg.dev/yes-chef-cookbook/cloud-run-source-deploy/yes-chef-cookbook:latest"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1000m"
          memory = "256Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "GCP_PROJECT"
        value = var.project_id
      }

      env {
        name  = "REGION"
        value = var.region
      }

      env {
        name  = "SERVICE"
        value = var.run_service_name
      }

      startup_probe {
        tcp_socket {
          port = 8080
        }
        period_seconds    = 240
        timeout_seconds   = 240
        failure_threshold = 1
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    timeout = "300s"

    # Use dedicated SA if desired; keep default compute for zero-downtime migration
    # Toggle by changing service_account below:
    # service_account = google_service_account.run.email
    service_account = google_service_account.run.email
  }

  # Allow unauthenticated — health checks and MCP auth is app-level (requireMcpAuth via cookbook code)
  depends_on = [google_project_service.services]

  lifecycle {
    # Ignore annotation churn from knative autoscaling (live uses autoscaling.knative.dev/*)
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }
}

# Allow public invoker for health checks / MCP (app-level per-cookbook auth still enforced)
resource "google_cloud_run_service_iam_member" "public_invoker" {
  location = google_cloud_run_v2_service.yes_chef.location
  project  = google_cloud_run_v2_service.yes_chef.project
  service  = google_cloud_run_v2_service.yes_chef.name
  role     = "roles/run.invoker"
  member   = "allUsers"

  depends_on = [google_cloud_run_v2_service.yes_chef]
}
