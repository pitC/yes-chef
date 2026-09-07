locals {
  project_id     = var.project_id
  project_number = var.project_number
}

data "google_project" "project" {
  project_id = var.project_id
}

# Enable required APIs
resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com",
    "firestore.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbilling.googleapis.com",
    "cloudfunctions.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "secretmanager.googleapis.com",
    "pubsub.googleapis.com",
    "eventarc.googleapis.com",
    "apikeys.googleapis.com",
  ])

  project = var.project_id
  service = each.key

  disable_on_destroy = false
}

# Declarative imports for existing resources (TF >=1.5)
import {
  to = google_firestore_database.default
  id = "projects/yes-chef-cookbook/databases/(default)"
}

import {
  to = google_cloud_run_v2_service.yes_chef
  id = "projects/yes-chef-cookbook/locations/europe-west1/services/yes-chef-cookbook"
}

import {
  to = google_pubsub_topic.billing_alerts
  id = "projects/yes-chef-cookbook/topics/billing-alerts"
}

import {
  to = google_cloudfunctions2_function.budget_cap
  id = "projects/yes-chef-cookbook/locations/europe-west1/functions/budget-cap"
}

import {
  to = google_billing_budget.cap
  id = "billingAccounts/012C2A-E1DB49-8C3E18/budgets/92e91195-8367-4918-ba57-1590cac43a25"
}
