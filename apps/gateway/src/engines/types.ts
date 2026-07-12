/** 対話エンジン（Gemini Live / OpenAI Realtime）を差し替え可能にするための共通インターフェース */
export interface VoiceEngineCallbacks {
  /** エージェントの応答音声（PCM16、config.outputSampleRate） */
  onAudio: (pcm: Buffer) => void;
  /** 会議側音声の文字起こし */
  onInputTranscript: (text: string) => void;
  /** エージェント発話の文字起こし */
  onOutputTranscript: (text: string) => void;
  /** エージェントの発話終了（1ターン完了） */
  onTurnComplete: () => void;
  onError: (err: Error) => void;
}

export interface VoiceEngineOptions {
  systemPrompt: string;
  language: string;
  voice?: string;
}

export interface VoiceEngine {
  connect(opts: VoiceEngineOptions, cb: VoiceEngineCallbacks): Promise<void>;
  /** 会議の音声を流し込む（PCM16、config.inputSampleRate） */
  sendAudio(pcm: Buffer): void;
  /** システムからの指示テキストを1ターンとして送る（入室アナウンス等に使用） */
  sendText(text: string): void;
  /** エージェントの発話を中断する（介入操作用） */
  interrupt(): void;
  close(): Promise<void>;
}
