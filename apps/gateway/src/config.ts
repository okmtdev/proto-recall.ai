export const config = {
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: process.env.DATABASE_URL ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  recallApiKey: process.env.RECALL_API_KEY ?? "",
  recallRegion: process.env.RECALL_REGION ?? "ap-northeast-1",
  signingSecret: process.env.GATEWAY_SIGNING_SECRET ?? "",
  // Live API のモデル名は変わりやすいので環境変数で差し替え可能にする
  // 最新の対応モデルは https://ai.google.dev/gemini-api/docs/live を確認
  geminiLiveModel:
    process.env.GEMINI_LIVE_MODEL ?? "gemini-2.5-flash-native-audio-preview-09-2025",
  // Recall.ai から届く音声（想定: S16LE/16kHz/mono）と Gemini 出力（24kHz）
  inputSampleRate: Number(process.env.INPUT_SAMPLE_RATE ?? 16000),
  outputSampleRate: Number(process.env.OUTPUT_SAMPLE_RATE ?? 24000),
  // 切断後にセッションを保持する時間（Cloud Run 60分切断 → Recall 自動再接続に備える）
  sessionKeepAliveMs: Number(process.env.SESSION_KEEP_ALIVE_MS ?? 5 * 60 * 1000),
} as const;

export function assertServerConfig(): void {
  const missing = [
    ["GATEWAY_SIGNING_SECRET", config.signingSecret],
    ["GEMINI_API_KEY", config.geminiApiKey],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    console.warn(`[config] missing env: ${missing.join(", ")} — 一部機能は動きません`);
  }
}
