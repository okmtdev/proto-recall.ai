# ─────────────────────────────────────────────────────────────
# persistent スタック: 消したくないもの（DB・イメージ・シークレット）
# 日常の作り直しは runtime スタック側だけで行う。
# ここを destroy すると DB のデータとイメージが消えるので注意。
# ─────────────────────────────────────────────────────────────

locals {
  required_apis = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "iamcredentials.googleapis.com",
  ]
}

# 共有プロジェクトの他リソースを巻き込まないよう、destroy しても API は無効化しない
resource "google_project_service" "apis" {
  for_each           = toset(local.required_apis)
  service            = each.value
  disable_on_destroy = false
}

# ── 既存 Cloud SQL インスタンス（参照のみ・管理しない）─────────
data "google_sql_database_instance" "existing" {
  name = var.cloudsql_instance_name
}

resource "google_sql_database" "app" {
  name     = var.db_name
  instance = data.google_sql_database_instance.existing.name
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "google_sql_user" "app" {
  name     = var.db_user
  instance = data.google_sql_database_instance.existing.name
  password = random_password.db.result
}

# ── コンテナレジストリ ────────────────────────────────────────
resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = var.artifact_repo_name
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}

# ── シークレット ──────────────────────────────────────────────
locals {
  # DATABASE_URL は接続方式で形が変わる
  database_url = var.db_connect_mode == "public_ip" ? (
    # Cloud SQL コネクタ（unix socket）経由
    "postgresql://${var.db_user}:${random_password.db.result}@localhost/${var.db_name}?host=/cloudsql/${data.google_sql_database_instance.existing.connection_name}"
    ) : (
    # プライベート IP 直結
    "postgresql://${var.db_user}:${random_password.db.result}@${data.google_sql_database_instance.existing.private_ip_address}:5432/${var.db_name}"
  )

  # 値を Terraform が管理するシークレット
  managed_secrets = {
    "database-url" = local.database_url
  }

  # 器だけ作り、値は gcloud で手動投入するシークレット（API キーを tfstate に入れない）
  manual_secrets = [
    "recall-api-key",
    "gemini-api-key",
    "openai-api-key",
    "google-oauth-client-id",
    "google-oauth-client-secret",
    "auth-secret",
    "gateway-signing-secret",
  ]
}

resource "google_secret_manager_secret" "managed" {
  for_each  = local.managed_secrets
  secret_id = each.key

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "managed" {
  for_each    = local.managed_secrets
  secret      = google_secret_manager_secret.managed[each.key].id
  secret_data = each.value
}

resource "google_secret_manager_secret" "manual" {
  for_each  = toset(local.manual_secrets)
  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}
