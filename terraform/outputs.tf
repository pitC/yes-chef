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
