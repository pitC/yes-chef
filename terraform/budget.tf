resource "google_pubsub_topic" "billing_alerts" {
  name    = "billing-alerts"
  project = var.project_id

  depends_on = [google_project_service.services]

  lifecycle {
    prevent_destroy = true
  }
}

# Billing publisher IAM — disabled: service account service-${var.project_number}@gcp-sa-billing.iam.gserviceaccount.com
# does not exist in this project; billing budgets publish via Google-managed service account.
# The topic will still receive budget notifications without explicit IAM (managed by Google).
# resource "google_pubsub_topic_iam_member" "billing_publisher" {
#   project = var.project_id
#   topic   = google_pubsub_topic.billing_alerts.name
#   role    = "roles/pubsub.publisher"
#   member  = "serviceAccount:service-${var.project_number}@gcp-sa-billing.iam.gserviceaccount.com"
# }

resource "google_billing_budget" "cap" {
  billing_account = var.billing_account_id
  display_name    = "yes-chef-cookbook 10 EUR cap"

  budget_filter {
    projects               = ["projects/${var.project_number}"]
    calendar_period        = "MONTH"
    credit_types_treatment = "INCLUDE_ALL_CREDITS"
  }

  amount {
    specified_amount {
      currency_code = "EUR"
      units         = tostring(var.budget_amount)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 0.9
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  all_updates_rule {
    pubsub_topic   = google_pubsub_topic.billing_alerts.id
    schema_version = "1.0"
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_pubsub_topic.billing_alerts]
}

# Budget-cap Cloud Function Gen2 — source is functions/budget-cap (moved from yes-chef-recipes)
resource "google_storage_bucket" "budget_cap_source" {
  name     = "${var.project_id}-budget-cap-source"
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true

  depends_on = [google_project_service.services]
}

data "archive_file" "budget_cap_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/budget-cap"
  output_path = "${path.module}/.budget-cap.zip"
  excludes    = ["node_modules"]
}

resource "google_storage_bucket_object" "budget_cap_zip" {
  name   = "budget-cap-${data.archive_file.budget_cap_zip.output_md5}.zip"
  bucket = google_storage_bucket.budget_cap_source.name
  source = data.archive_file.budget_cap_zip.output_path
}

resource "google_cloudfunctions2_function" "budget_cap" {
  name     = "budget-cap"
  location = var.region
  project  = var.project_id

  build_config {
    runtime     = "nodejs22"
    entry_point = "handleBudgetAlert"

    source {
      storage_source {
        bucket = google_storage_bucket.budget_cap_source.name
        object = google_storage_bucket_object.budget_cap_zip.name
      }
    }
  }

  service_config {
    service_account_email            = "158345618336-compute@developer.gserviceaccount.com"
    available_memory                 = "256M"
    timeout_seconds                  = 60
    max_instance_count               = 1
    available_cpu                    = "0.166"

    environment_variables = {
      GCP_PROJECT      = var.project_id
      GOOGLE_CLOUD_PROJECT = var.project_id
      REGION           = var.region
      SERVICE          = var.run_service_name
      DISABLE_BILLING  = "false"
      LOG_EXECUTION_ID = "true"
    }
  }

  event_trigger {
    event_type            = "google.cloud.pubsub.topic.v1.messagePublished"
    pubsub_topic          = google_pubsub_topic.billing_alerts.id
    trigger_region        = var.region
    retry_policy          = "RETRY_POLICY_DO_NOT_RETRY"
    service_account_email = "158345618336-compute@developer.gserviceaccount.com"
  }

  depends_on = [
    google_project_service.services,
    google_pubsub_topic.billing_alerts,
    google_storage_bucket_object.budget_cap_zip,
  ]

  labels = {
    app = "yes-chef-budget-cap"
  }
}

# Allow budget-cap function SA to patch Cloud Run (roles/run.admin) — required for PATCH scaling
resource "google_project_iam_member" "budget_cap_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:158345618336-compute@developer.gserviceaccount.com"
}
