# proto-recall.ai

Google Meet に**リアルタイムで音声会話できる AI エージェント**を送り込む個人向け Web サービスのプロトタイプ。
[Recall.ai](https://www.recall.ai)（Meeting Bot + Output Media）× Gemini Live API × GCP（Cloud Run ゼロスケール）で、**待機中のインフラコストほぼ ¥0** を狙う構成。

📄 詳細仕様: [docs/spec.md](docs/spec.md) / インフラ手順: [infra/README.md](infra/README.md)

## 仕組み

```
Google Meet ─ Recall.ai ボット ──会議音声──▶ gateway (Cloud Run) ──▶ Gemini Live API
     ▲                                          │        ▲                  │
     └──── Output Media ページ ◀──応答音声───────┘        └────応答音声・字幕──┘
                        ダッシュボード(Next.js) ◀──文字起こしライブ配信──┘
```

- Web で Google ログイン → エージェント設定 → Meet の URL を貼ってボット召喚
- エージェントは**名前で呼びかけられたときだけ**応答（ウェイクワード方式）
- **会議が終わると議事録（要約・決定事項・アクションアイテム）が自動生成**される（Gemini バッチ、1会議数円）
- 会議ごとの**概算コストと今月の合計**をダッシュボードに表示
- Cloud Run の60分 WebSocket 上限は Recall.ai の自動再接続（3秒×最大30回）で吸収

## リポジトリ構成

| パス | 内容 |
|---|---|
| `docs/spec.md` | 仕様書（画面・フロー・データモデル・コスト方針） |
| `infra/persistent/` | Terraform: 既存 Cloud SQL 内の専用 DB・Artifact Registry・Secret（残す層） |
| `infra/runtime/` | Terraform: Cloud Run ×2・IAM（いつでも destroy/apply してよい層） |
| `apps/web/` | Next.js: Google ログイン・エージェント設定・ボット召喚・ライブビュー |
| `apps/gateway/` | Node/TS: 音声の交換台（Recall ⇄ 対話エンジン ⇄ Output Media/ダッシュボード） |
| `db/schema.sql` | PostgreSQL スキーマ |

## セットアップ（要約）

1. **手動の事前準備（初回のみ）**: tfstate バケット作成 / Google OAuth クライアント作成 / Recall.ai・Gemini の API キー取得 → 詳細は [infra/README.md](infra/README.md)
2. `make apply-persistent` → シークレット投入 → `make apply-runtime`
3. `db/schema.sql` を適用、アプリをビルドして `gcloud run deploy`
4. web の URL を開いて Google ログイン → Meet URL を貼って召喚

使わない期間は `make destroy-runtime` で消してよい（データは残る）。

## 開発ステータス / 既知の TODO

- [ ] **未検証の骨格**です。`npm install` → `typecheck`/`build`、`terraform validate` をローカルで通すのが最初の一歩（この雛形を生成した環境は npm レジストリ等へのアクセスが制限されており未実行）
- [ ] Recall.ai の bot 作成ペイロード・音声イベント形式の実打ち確認（`apps/web/src/lib/recall.ts` / `apps/gateway/src/recall.ts` の TODO）
- [ ] Gemini Live のモデル名確認（`GEMINI_LIVE_MODEL` で差し替え可）
- [ ] Output Media がアカウントで有効か確認（無効なら Recall.ai サポートへ）
- [ ] Webhook の Svix 署名検証 / OpenAI Realtime adapter / 入室時アナウンス

## コスト目安

- アイドル: **ほぼ ¥0/月**（Cloud Run min 0、DB は既存 Cloud SQL に相乗り、LB なし）
- 会議1時間あたり: Recall $0.50 + 文字起こし $0.15 + Gemini Live 〜$0.5 + Cloud Run 〜$0.2 ≈ **$1.2〜1.4**
