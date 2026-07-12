# 使い方:
#   make init STATE_BUCKET=your-tfstate-bucket
#   make apply-persistent PROJECT=your-project INSTANCE=your-cloudsql-instance
#   make apply-runtime    PROJECT=your-project INSTANCE=your-cloudsql-instance
#   make destroy-runtime  PROJECT=your-project INSTANCE=your-cloudsql-instance
#
# 変数は environment でも渡せる: export PROJECT=... INSTANCE=... STATE_BUCKET=...

STATE_BUCKET ?=
PROJECT      ?=
INSTANCE     ?=
TF           ?= terraform

TFVARS = -var "project_id=$(PROJECT)" -var "cloudsql_instance_name=$(INSTANCE)"

.PHONY: init init-persistent init-runtime \
        plan-persistent apply-persistent destroy-persistent \
        plan-runtime apply-runtime destroy-runtime

init: init-persistent init-runtime

init-persistent:
	$(TF) -chdir=persistent init -backend-config="bucket=$(STATE_BUCKET)" -backend-config="prefix=proto-recall/persistent"

init-runtime:
	$(TF) -chdir=runtime init -backend-config="bucket=$(STATE_BUCKET)" -backend-config="prefix=proto-recall/runtime"

plan-persistent:
	$(TF) -chdir=persistent plan $(TFVARS)

apply-persistent:
	$(TF) -chdir=persistent apply $(TFVARS)

# 注意: DB（データ含む）とレジストリのイメージが消える。既存 Cloud SQL インスタンス自体は消えない。
destroy-persistent:
	$(TF) -chdir=persistent destroy $(TFVARS)

plan-runtime:
	$(TF) -chdir=runtime plan $(TFVARS)

apply-runtime:
	$(TF) -chdir=runtime apply $(TFVARS)

# 日常的に使ってよい: Cloud Run と IAM だけが消える。数分で apply し直せる。
destroy-runtime:
	$(TF) -chdir=runtime destroy $(TFVARS)
