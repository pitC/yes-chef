variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "yes-chef-cookbook"
}

variable "project_number" {
  description = "GCP project number (for billing budget filter)"
  type        = string
  default     = "158345618336"
}

variable "region" {
  description = "Default region for Cloud Run and functions"
  type        = string
  default     = "europe-west1"
}

variable "firestore_location" {
  description = "Firestore location — must be nam5 per live database, not region"
  type        = string
  default     = "nam5"
}

variable "run_service_name" {
  description = "Cloud Run service name (must preserve existing yes-chef-cookbook to keep URL)"
  type        = string
  default     = "yes-chef-cookbook"
}

variable "billing_account_id" {
  description = "Billing account ID for budget"
  type        = string
  default     = "012C2A-E1DB49-8C3E18"
}

variable "budget_amount" {
  description = "Budget amount in EUR"
  type        = number
  default     = 10
}

variable "firebase_config_json" {
  description = "JSON string for firebaseConfig (apiKey etc.) — stored in Secret Manager, not committed"
  type        = string
  default     = ""
  sensitive   = true
}

variable "image" {
  description = "Container image for Cloud Run (built from server/Dockerfile). Set via TF_VAR_image or leave empty for Cloud Build."
  type        = string
  default     = ""
}
