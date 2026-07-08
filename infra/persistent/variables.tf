variable "project_id" {
  description = "GCP プロジェクト ID"
  type        = string
}

variable "region" {
  description = "リージョン"
  type        = string
  default     = "asia-northeast1"
}

variable "cloudsql_instance_name" {
  description = "既存 Cloud SQL インスタンス名（このスタックは中身の DB/ユーザーだけを管理し、インスタンス自体には触れない）"
  type        = string
}

variable "db_name" {
  description = "このアプリ専用に作成する database 名"
  type        = string
  default     = "proto_recall"
}

variable "db_user" {
  description = "このアプリ専用に作成する DB ユーザー名"
  type        = string
  default     = "proto_recall_app"
}

variable "db_connect_mode" {
  description = "Cloud Run からの接続方式: public_ip = Cloud SQL コネクタ(unix socket) / private_ip = Direct VPC egress"
  type        = string
  default     = "public_ip"

  validation {
    condition     = contains(["public_ip", "private_ip"], var.db_connect_mode)
    error_message = "db_connect_mode は public_ip か private_ip。"
  }
}

variable "artifact_repo_name" {
  description = "Artifact Registry リポジトリ名"
  type        = string
  default     = "proto-recall"
}
