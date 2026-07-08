/**
 * Recall.ai リアルタイム WebSocket から届くメッセージの取り出し。
 * 想定イベント（bot 作成時に audio_mixed_raw.data を購読）:
 *   { "event": "audio_mixed_raw.data", "data": { "data": { "buffer": "<base64 PCM16/16kHz/mono>" }, ... } }
 * プロトコル詳細: https://docs.recall.ai/docs/real-time-websocket-endpoints
 * TODO(M1): 実イベントをログで確認してフィールド名・フォーマットを固定する
 */
export function extractAudioChunk(raw: string | Buffer): Buffer | null {
  try {
    const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
    if (msg?.event !== "audio_mixed_raw.data") return null;
    const b64 = msg?.data?.data?.buffer;
    if (typeof b64 !== "string" || b64.length === 0) return null;
    return Buffer.from(b64, "base64");
  } catch {
    // JSON でないフレームは無視（将来のバイナリプロトコル対応は M1 で）
    return null;
  }
}
