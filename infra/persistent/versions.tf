terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # state バケットは初回に手動作成し、init 時に -backend-config で渡す（infra/README.md 参照）
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}
