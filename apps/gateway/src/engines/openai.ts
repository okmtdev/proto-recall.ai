import type { VoiceEngine, VoiceEngineCallbacks, VoiceEngineOptions } from "./types.js";

/**
 * OpenAI Realtime API adapter（未実装スタブ）。
 * 実装する場合: wss://api.openai.com/v1/realtime に接続し、
 * input_audio_buffer.append / response.audio.delta 等のイベントを types.ts に写像する。
 * https://platform.openai.com/docs/guides/realtime
 */
export class OpenAIRealtimeEngine implements VoiceEngine {
  async connect(_opts: VoiceEngineOptions, _cb: VoiceEngineCallbacks): Promise<void> {
    throw new Error("OpenAI Realtime adapter は未実装です（engines/openai.ts）。engine=gemini を使ってください。");
  }
  sendAudio(_pcm: Buffer): void {}
  interrupt(): void {}
  async close(): Promise<void> {}
}
