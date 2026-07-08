# ─────────────────────────────────────────────────────────────
# runtime スタック: Cloud Run ×2 と IAM。
# いつでも terraform destroy / apply で作り直してよい層。
# 前提: persistent スタックが apply 済みで、manual シークレットに値が入っていること。
# ─────────────────────────────────────────────────────────────

data "google_sql_database_instance" "existing" {
  name = var.cloudsql_instance_name
}

locals {
  use_connector = var.db_connect_mode == "public_ip"
}

# ── サービスアカウント ─────────────────────────────────────────
resource "google_service_account" "web" {
  account_id   = "proto-recall-web"
  display_name = "proto-recall web (Next.js)"
}

resource "google_service_account" "gateway" {
  account_id   = "proto-recall-gateway"
  display_name = "proto-recall realtime gateway"
}

# Cloud SQL コネクタ利用に必要（private_ip でも無害なので常に付与）
resource "google_project_iam_member" "cloudsql_client" {
  for_each = {
    web     = google_service_account.web.email
    gateway = google_service_account.gateway.email
  }
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${each.value}"
}

# ── シークレットへのアクセス権 ─────────────────────────────────
locals {
  web_secrets     = ["database-url", "auth-secret", "google-oauth-client-id", "google-oauth-client-secret", "recall-api-key", "gateway-signing-secret"]
  gateway_secrets = concat(["database-url", "gemini-api-key", "recall-api-key", "gateway-signing-secret"], var.enable_openai ? ["openai-api-key"] : [])
}

resource "google_secret_manager_secret_iam_member" "web" {
  for_each  = toset(local.web_secrets)
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.web.email}"
}

resource "google_secret_manager_secret_iam_member" "gateway" {
  for_each  = toset(local.gateway_secrets)
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.gateway.email}"
}

# ── gateway: リアルタイム音声の交換台 ──────────────────────────
resource "google_cloud_run_v2_service" "gateway" {
  name     = "proto-recall-gateway"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account  = google_service_account.gateway.email
    timeout          = "3600s" # Cloud Run の上限。切断されても Recall.ai が自動再接続する
    session_affinity = true
    max_instance_request_concurrency = 100

    scaling {
      min_instance_count = var.gateway_min_instances
      max_instance_count = 1 # 全接続を同一インスタンスへ集約（プロトタイプの割り切り）
    }

    containers {
      image = var.gateway_image

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle          = true # リクエスト課金: 接続がある間だけ CPU 割当
        startup_cpu_boost = true
      }

      env {
        name  = "RECALL_REGION"
        value = "ap-northeast-1"
      }

      dynamic "env" {
        for_each = {
          DATABASE_URL           = "database-url"
          GEMINI_API_KEY         = "gemini-api-key"
          RECALL_API_KEY         = "recall-api-key"
          GATEWAY_SIGNING_SECRET = "gateway-signing-secret"
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      dynamic "env" {
        for_each = var.enable_openai ? [1] : []
        content {
          name = "OPENAI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = "openai-api-key"
              version = "latest"
            }
          }
        }
      }

      dynamic "volume_mounts" {
        for_each = local.use_connector ? [1] : []
        content {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }

    dynamic "volumes" {
      for_each = local.use_connector ? [1] : []
      content {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [data.google_sql_database_instance.existing.connection_name]
        }
      }
    }

    dynamic "vpc_access" {
      for_each = local.use_connector ? [] : [1]
      content {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = var.vpc_network
          subnetwork = var.vpc_subnetwork
        }
      }
    }
  }

  lifecycle {
    # デプロイは gcloud run deploy で行うため、イメージ差分は Terraform で追わない
    ignore_changes = [template[0].containers[0].image]
  }

  depends_on = [google_secret_manager_secret_iam_member.gateway]
}

# ── web: Next.js（画面 + API + Google ログイン）────────────────
resource "google_cloud_run_v2_service" "web" {
  name     = "proto-recall-web"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.web.email

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = var.web_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "RECALL_REGION"
        value = "ap-northeast-1"
      }
      env {
        name  = "GATEWAY_URL"
        value = google_cloud_run_v2_service.gateway.uri
      }
      env {
        # Auth.js: Cloud Run の URL をそのまま信頼する（カスタムドメイン移行時もそのまま動く）
        name  = "AUTH_TRUST_HOST"
        value = "true"
      }

      dynamic "env" {
        for_each = {
          DATABASE_URL           = "database-url"
          AUTH_SECRET            = "auth-secret"
          AUTH_GOOGLE_ID         = "google-oauth-client-id"
          AUTH_GOOGLE_SECRET     = "google-oauth-client-secret"
          RECALL_API_KEY         = "recall-api-key"
          GATEWAY_SIGNING_SECRET = "gateway-signing-secret"
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      dynamic "volume_mounts" {
        for_each = local.use_connector ? [1] : []
        content {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }

    dynamic "volumes" {
      for_each = local.use_connector ? [1] : []
      content {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [data.google_sql_database_instance.existing.connection_name]
        }
      }
    }

    dynamic "vpc_access" {
      for_each = local.use_connector ? [] : [1]
      content {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = var.vpc_network
          subnetwork = var.vpc_subnetwork
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }

  depends_on = [google_secret_manager_secret_iam_member.web]
}

# ── 公開アクセス（アプリ層でトークン認証する）───────────────────
resource "google_cloud_run_v2_service_iam_member" "public" {
  for_each = {
    web     = google_cloud_run_v2_service.web.name
    gateway = google_cloud_run_v2_service.gateway.name
  }
  name     = each.value
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
