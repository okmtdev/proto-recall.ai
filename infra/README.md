# infra — Terraform（GCP）

「消していい層」と「残す層」を分けた2スタック構成。**既存の Cloud SQL インスタンスは一切管理しない**（中に専用 DB とユーザーを作るだけ）。

| スタック | 中身 | destroy の意味 |
|---|---|---|
| `persistent/` | 専用 DB + DB ユーザー（既存インスタンス内）、Artifact Registry、Secret Manager | データ・イメージが消える。普段は触らない |
| `runtime/` | Cloud Run ×2（web / gateway）、サービスアカウント、IAM | いつでも消してよい。apply で数分で復元 |

アイドルコスト: Cloud Run は min 0 のため **会議もアクセスもなければ ≈ ¥0/月**。runtime を destroy すればさらに完全にゼロ。

## 0. 事前準備（初回のみ・手動）

Terraform で管理できない3点だけ手作業です。

```bash
gcloud auth application-default login
export PROJECT=<your-project-id>
export STATE_BUCKET=<your-tfstate-bucket>
export INSTANCE=<existing-cloudsql-instance-name>

# (1) tfstate 用バケット
gcloud storage buckets create gs://$STATE_BUCKET --project=$PROJECT --location=asia-northeast1 --uniform-bucket-level-access
```

- (2) **Google OAuth クライアント**（Terraform 非対応）: [GCP コンソール > APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials) で「OAuth クライアント ID（ウェブアプリケーション）」を作成。リダイレクト URI は runtime apply 後に判明する web の URL + `/api/auth/callback/google` を登録。
- (3) **API キーの取得**: Recall.ai（ap-northeast-1 のダッシュボード）、Google AI Studio（Gemini）、必要なら OpenAI。

## 1. persistent を apply

```bash
cd infra
make init-persistent STATE_BUCKET=$STATE_BUCKET
make apply-persistent PROJECT=$PROJECT INSTANCE=$INSTANCE
```

`db_connect_mode` の既定は `public_ip`（Cloud SQL コネクタ経由）。インスタンスがプライベート IP のみなら両スタックに `-var db_connect_mode=private_ip` と VPC 変数を渡すこと（`runtime/variables.tf` 参照）。

## 2. シークレットに値を投入（初回のみ）

`database-url` は Terraform が自動生成済み。残りを投入する:

```bash
echo -n "<recall api key>"        | gcloud secrets versions add recall-api-key            --data-file=- --project=$PROJECT
echo -n "<gemini api key>"        | gcloud secrets versions add gemini-api-key            --data-file=- --project=$PROJECT
echo -n "<oauth client id>"       | gcloud secrets versions add google-oauth-client-id    --data-file=- --project=$PROJECT
echo -n "<oauth client secret>"   | gcloud secrets versions add google-oauth-client-secret --data-file=- --project=$PROJECT
openssl rand -base64 32           | gcloud secrets versions add auth-secret               --data-file=- --project=$PROJECT
openssl rand -base64 32           | gcloud secrets versions add gateway-signing-secret    --data-file=- --project=$PROJECT
# OpenAI を使う場合のみ（runtime に -var enable_openai=true も渡す）
echo -n "<openai api key>"        | gcloud secrets versions add openai-api-key            --data-file=- --project=$PROJECT
```

> 注意: シークレットに版が無いまま runtime を apply すると Cloud Run が起動時に失敗します。先にここを済ませること。

## 3. runtime を apply

```bash
make init-runtime STATE_BUCKET=$STATE_BUCKET
make apply-runtime PROJECT=$PROJECT INSTANCE=$INSTANCE
```

初回はプレースホルダイメージで起動します。出力された `web_url` を OAuth クライアントのリダイレクト URI（`<web_url>/api/auth/callback/google`）に登録。

## 4. アプリのビルドとデプロイ

```bash
REGION=asia-northeast1
REPO=$REGION-docker.pkg.dev/$PROJECT/proto-recall
gcloud auth configure-docker $REGION-docker.pkg.dev

docker build -t $REPO/web:latest apps/web && docker push $REPO/web:latest
docker build -t $REPO/gateway:latest apps/gateway && docker push $REPO/gateway:latest

gcloud run deploy proto-recall-web     --image $REPO/web:latest     --region $REGION --project $PROJECT
gcloud run deploy proto-recall-gateway --image $REPO/gateway:latest --region $REGION --project $PROJECT
```

（イメージ更新は gcloud で行い、Terraform は `ignore_changes` で追わない設計。CI/CD 化は GitHub Actions + Workload Identity Federation で後日）

## 5. DB スキーマ適用（初回のみ）

```bash
# ローカルから Cloud SQL Auth Proxy などで接続して:
psql "$DATABASE_URL" -f ../db/schema.sql
```

## 日常運用

```bash
make destroy-runtime PROJECT=$PROJECT INSTANCE=$INSTANCE   # 使わない期間は消す（データは残る）
make apply-runtime   PROJECT=$PROJECT INSTANCE=$INSTANCE   # 再開（数分）
```
