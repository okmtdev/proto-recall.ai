# Google ログインのセットアップ手順

Web サービス（apps/web）は Auth.js v5 の Google プロバイダでログインする。
必要なものは **OAuth クライアント ID / Secret** と **AUTH_SECRET** の3つだけ。
OAuth クライアントは Terraform で作れない（API 非対応）ため、ここだけ手作業になる。

## 環境変数との対応（先に全体像）

| 変数 | 中身 | 本番（Cloud Run） | ローカル |
|---|---|---|---|
| `AUTH_GOOGLE_ID` | OAuth クライアント ID | Secret `google-oauth-client-id` から注入（Terraform 設定済み） | `apps/web/.env` |
| `AUTH_GOOGLE_SECRET` | OAuth クライアント Secret | Secret `google-oauth-client-secret` から注入 | `apps/web/.env` |
| `AUTH_SECRET` | セッション署名用ランダム値 | Secret `auth-secret` から注入 | `apps/web/.env` |
| `AUTH_TRUST_HOST` | `true` 固定（Cloud Run の URL を信頼） | Terraform が設定済み | `.env.example` に記載済み |

Auth.js v5 はこれらの変数名を自動で読むので、アプリ側のコード変更は不要。

## 手順

### 1. OAuth 同意画面（初回のみ）

[GCP コンソール > Google Auth Platform](https://console.cloud.google.com/auth/overview)（旧: APIs & Services > OAuth consent screen）で設定する。プロジェクトは既存 Cloud SQL と同じもので良い。

1. **App 名 / サポートメール**: 任意（例: proto-recall.ai / 自分のメール）
2. **Audience（ユーザータイプ）**:
   - 個人の Gmail プロジェクトなら **External** を選ぶ
   - Google Workspace 組織内だけで使うなら **Internal**（審査・テストユーザー登録が不要になる）
3. **External を選んだ場合**: 公開ステータスが「Testing」の間は、**テストユーザーに登録したアカウントしかログインできない**。
   [Audience 画面](https://console.cloud.google.com/auth/audience)で自分（と使わせたい人）の Gmail を Test users に追加すること。
   - 誰でもログインできるようにするには「Publish app」する。要求スコープが `openid / email / profile` のみ（このアプリはそう）なら Google の審査なしで公開できる
4. **スコープ**: 追加設定不要（Auth.js の Google プロバイダは既定で openid / email / profile のみ要求する）

### 2. OAuth クライアント作成

[Credentials](https://console.cloud.google.com/apis/credentials) > Create Credentials > **OAuth client ID** > Application type: **Web application**

- **Authorized JavaScript origins**:
  - `http://localhost:3000`（ローカル開発用）
  - `https://<web_url>`（`make apply-runtime` の出力 `web_url`。後から追記で良い）
- **Authorized redirect URIs**（パスまで完全一致が必要）:
  - `http://localhost:3000/api/auth/callback/google`
  - `https://<web_url>/api/auth/callback/google`

作成後に表示される **Client ID** と **Client secret** を控える。

### 3. 値を設定する

**本番（Cloud Run）** — Secret Manager に投入（`infra/README.md` §2 と同じ）:

```bash
echo -n "<client id>"     | gcloud secrets versions add google-oauth-client-id     --data-file=- --project=$PROJECT
echo -n "<client secret>" | gcloud secrets versions add google-oauth-client-secret --data-file=- --project=$PROJECT
openssl rand -base64 32   | gcloud secrets versions add auth-secret                --data-file=- --project=$PROJECT
```

投入後、新しい版を読ませるには Cloud Run の再デプロイ（リビジョン作成）が必要:
`gcloud run deploy proto-recall-web --image <現行イメージ> --region asia-northeast1`

**ローカル開発** — `apps/web/.env` に記入（`.env.example` をコピー）:

```bash
cd apps/web && cp .env.example .env
# AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET / AUTH_SECRET を埋める
npm run dev   # http://localhost:3000
```

### 4. 動作確認

1. web の URL を開く → 「Google でログイン」→ Google の同意画面 → `/dashboard` に遷移すれば成功
2. 初回ログインで `users` テーブルに1行 upsert される（`select * from users;` で確認できる）

## トラブルシューティング

| 症状 | 原因と対処 |
|---|---|
| `Error 400: redirect_uri_mismatch` | リダイレクト URI が完全一致していない。`https://` か、パスが `/api/auth/callback/google` か、末尾スラッシュが無いかを確認 |
| 「このアプリは Google で確認されていません」→ 続行できない / `access_denied` | External + Testing のままでテストユーザー未登録。Audience 画面で自分の Gmail を Test users に追加するか、Publish する |
| ログイン後すぐエラーページ（Configuration） | `AUTH_SECRET` が未設定。Secret の版が入っているか、ローカルなら `.env` を確認 |
| Cloud Run でだけコールバックが失敗する | `AUTH_TRUST_HOST=true` が入っているか（Terraform 既定で設定済み）。カスタムドメインに変えた場合はリダイレクト URI の追加を忘れずに |
| `users` に行が増えない | `DATABASE_URL` 未設定か `db/schema.sql` 未適用。ログイン自体は成功するが JWT に userId が乗らず `/dashboard` から弾かれる |

## 補足

- クライアント ID は秘密情報ではないが、Client secret は漏らさないこと（リポジトリにコミットしない。`.env` は .gitignore 済み）
- カスタムドメインへ移行したら、JavaScript origins / redirect URIs に新ドメインを追加するだけで良い（コード変更不要）
