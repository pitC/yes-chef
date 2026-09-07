output "bucket_name" {
  description = "GCS bucket for static hosting (Option A)"
  value       = google_storage_bucket.static.name
}

output "bucket_url" {
  description = "Public website URL (Option A)"
  value       = "https://storage.googleapis.com/${google_storage_bucket.static.name}/index.html"
}

output "run_url" {
  description = "Cloud Run URL (preserved yes-chef-cookbook)"
  value       = google_cloud_run_v2_service.yes_chef.uri
}

output "mcp_endpoint" {
  description = "MCP endpoint"
  value       = "${google_cloud_run_v2_service.yes_chef.uri}/mcp"
}

output "health_url" {
  description = "Health check"
  value       = "${google_cloud_run_v2_service.yes_chef.uri}/health"
}

output "firestore_location" {
  value = google_firestore_database.default.location_id
}

output "budget_name" {
  value = google_billing_budget.cap.name
}
