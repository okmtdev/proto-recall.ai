output "artifact_registry_url" {
  description = "docker push 先のベース URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"
}

output "cloudsql_connection_name" {
  description = "Cloud SQL 接続名（project:region:instance）"
  value       = data.google_sql_database_instance.existing.connection_name
}

output "db_name" {
  value = google_sql_database.app.name
}

output "db_user" {
  value = google_sql_user.app.name
}

output "secret_ids" {
  description = "作成したシークレット ID 一覧"
  value = concat(
    [for s in google_secret_manager_secret.managed : s.secret_id],
    [for s in google_secret_manager_secret.manual : s.secret_id],
  )
}
