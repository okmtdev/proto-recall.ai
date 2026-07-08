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
  description = "既存 Cloud SQL インスタンス名（persistent スタックと同じ値）"
  type        = string
}

variable "db_connect_mode" {
  description = "persistent スタックと同じ値にすること: public_ip / private_ip"
  type        = string
  default     = "public_ip"

  validation {
    condition     = contains(["public_ip", "private_ip"], var.db_connect_mode)
    error_message = "db_connect_mode は public_ip か private_ip。"
  }
}

variable "vpc_network" {
  description = "db_connect_mode = private_ip のときに Cloud Run を繋ぐ VPC ネットワーク名"
  type        = string
  default     = ""
}

variable "vpc_subnetwork" {
  description = "db_connect_mode = private_ip のときのサブネット名"
  type        = string
  default     = ""
}

variable "web_image" {
  description = "web の Cloud Run イメージ。初回はプレースホルダで apply し、後から本物を deploy して良い"
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "gateway_image" {
  description = "gateway の Cloud Run イメージ。初回はプレースホルダ可"
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "enable_openai" {
  description = "true にすると gateway に OPENAI_API_KEY（Secret: openai-api-key）を渡す。先に値の投入が必要"
  type        = bool
  default     = false
}

variable "gateway_min_instances" {
  description = "gateway の最小インスタンス数。0 = 完全ゼロスケール（既定）"
  type        = number
  default     = 0
}
