output "web_url" {
  description = "Web サービスの URL（Google OAuth のリダイレクト URI 登録にも使う）"
  value       = google_cloud_run_v2_service.web.uri
}

output "gateway_url" {
  description = "gateway の URL（Recall.ai の realtime_endpoints / output_media に渡す）"
  value       = google_cloud_run_v2_service.gateway.uri
}

output "web_service_account" {
  value = google_service_account.web.email
}

output "gateway_service_account" {
  value = google_service_account.gateway.email
}
