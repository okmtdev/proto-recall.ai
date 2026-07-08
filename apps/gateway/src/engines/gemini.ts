import { GoogleGenAI, Modality } from "@google/genai";
import { config } from "../config.js";
import type { VoiceEngine, VoiceEngineCallbacks, VoiceEngineOptions } from "./types.js";

/**
 * Gemini Live API (native audio) adapter。
 * 音声入力: PCM16/16kHz、音声出力: PCM16/24kHz。
 * SDK のメッセージ型は流動的なので受信側は防御的に扱う。
 * 仕様: https://ai.google.dev/gemini-api/docs/live
 */
export class GeminiLiveEngine implements VoiceEngine {
  // SDK の Session 型に依存しすぎないよう最小限のシグネチャで保持する
  private session: {
    sendRealtimeInput: (input: unknown) => void;
    close: () => void;
  } | null = null;
  private closed = false;

  async connect(opts: VoiceEngineOptions, cb: VoiceEngineCallbacks): Promise<void> {
    const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

    this.session = (await ai.live.connect({
      model: config.geminiLiveModel,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: opts.systemPrompt,
        // 入出力両方の文字起こしを受け取る（ライブビュー表示とウェイクワード判定に使う）
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        // 長い会議でセッションが切れないように（TODO: sessionResumption の実測確認）
        contextWindowCompression: { slidingWindow: {} },
        speechConfig: opts.voice
          ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice } } }
          : undefined,
      },
      callbacks: {
        onopen: () => console.log("[gemini] live session opened"),
        onmessage: (message: unknown) => this.handleMessage(message, cb),
        onerror: (e: unknown) => cb.onError(e instanceof Error ? e : new Error(String(e))),
        onclose: (e: unknown) => {
          console.log("[gemini] live session closed", e);
          if (!this.closed) cb.onError(new Error("gemini live session closed unexpectedly"));
        },
      },
    })) as unknown as { sendRealtimeInput: (input: unknown) => void; close: () => void };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleMessage(message: any, cb: VoiceEngineCallbacks): void {
    try {
      const sc = message?.serverContent;
      if (!sc) return;

      if (sc.inputTranscription?.text) cb.onInputTranscript(String(sc.inputTranscription.text));
      if (sc.outputTranscription?.text) cb.onOutputTranscript(String(sc.outputTranscription.text));

      const parts: any[] = sc.modelTurn?.parts ?? [];
      for (const part of parts) {
        const data = part?.inlineData?.data;
        if (typeof data === "string" && data.length > 0) {
          cb.onAudio(Buffer.from(data, "base64"));
        }
      }

      if (sc.turnComplete) cb.onTurnComplete();
    } catch (err) {
      cb.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  sendAudio(pcm: Buffer): void {
    this.session?.sendRealtimeInput({
      audio: {
        data: pcm.toString("base64"),
        mimeType: `audio/pcm;rate=${config.inputSampleRate}`,
      },
    });
  }

  interrupt(): void {
    // Live API は新しい発話入力で自動的に barge-in する。明示的な中断 API は今のところ
    // activityStart/activityEnd の手動制御でしか行えないため、MVP では未実装。
  }

  async close(): Promise<void> {
    this.closed = true;
    this.session?.close();
    this.session = null;
  }
}
