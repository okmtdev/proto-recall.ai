import type { WebSocket } from "ws";
import { config } from "./config.js";
import { persistTranscriptSegment } from "./db.js";
import { GeminiLiveEngine } from "./engines/gemini.js";
import { OpenAIRealtimeEngine } from "./engines/openai.js";
import type { VoiceEngine } from "./engines/types.js";

/**
 * エンジンから届く文字起こしは細切れのフラグメントなので、
 * 文末（句点等）か一定量・一定時間でまとめて1レコードとして保存する。
 */
class TranscriptBuffer {
  private text = "";
  private firstTsMs = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private flushFn: (text: string, tsMs: number) => void) {}

  append(fragment: string, tsMs: number): void {
    if (this.text === "") this.firstTsMs = tsMs;
    this.text += fragment;
    if (this.timer) clearTimeout(this.timer);
    if (/[。．！？!?]\s*$/.test(this.text) || this.text.length > 200) {
      this.flush();
    } else {
      this.timer = setTimeout(() => this.flush(), 4000);
    }
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const t = this.text.trim();
    this.text = "";
    if (t) this.flushFn(t, this.firstTsMs);
  }
}

export interface AgentProfile {
  name: string;
  wakeWord: string;
  systemPrompt: string;
  language: string;
  engine: "gemini" | "openai";
  voice?: string;
}

interface DashboardEvent {
  type: "transcript" | "agent_state" | "error";
  speaker?: string;
  text?: string;
  state?: "idle" | "listening" | "thinking" | "speaking";
  tsMs: number;
}

/**
 * 会議1件ぶんの状態。WebSocket が切れても（Cloud Run の60分切断など）
 * エンジン接続とコンテキストを保持し、Recall.ai の自動再接続で継続する。
 */
export class MeetingSession {
  readonly meetingId: string;
  private engine: VoiceEngine | null = null;
  private outputSockets = new Set<WebSocket>();
  private dashboardSockets = new Set<WebSocket>();
  private transcriptBuffers = new Map<string, TranscriptBuffer>();
  private startedAt = Date.now();
  private disposeTimer: NodeJS.Timeout | null = null;

  /** ウェイクワード制御: 呼ばれてから応答1ターンぶんだけ音声を外へ出す */
  private responseWindowOpen = false;

  constructor(meetingId: string, private agent: AgentProfile) {
    this.meetingId = meetingId;
  }

  async start(): Promise<void> {
    if (this.engine) return;
    this.engine = this.agent.engine === "openai" ? new OpenAIRealtimeEngine() : new GeminiLiveEngine();

    await this.engine.connect(
      {
        systemPrompt:
          `${this.agent.systemPrompt}\n\n` +
          `あなたの名前は「${this.agent.name}」です。参加者に「${this.agent.wakeWord}」と呼びかけられたときだけ、` +
          `${this.agent.language === "ja" ? "日本語で" : ""}簡潔に応答してください。呼ばれていないときは沈黙してください。`,
        language: this.agent.language,
        voice: this.agent.voice,
      },
      {
        onAudio: (pcm) => {
          // ウェイクワードで開いた応答ウィンドウ内だけ、会議へ音声を流す
          if (!this.responseWindowOpen) return;
          this.broadcastBinary(this.outputSockets, pcm);
          this.broadcastEvent({ type: "agent_state", state: "speaking", tsMs: this.elapsedMs() });
        },
        onInputTranscript: (text) => {
          this.broadcastEvent({ type: "transcript", speaker: "meeting", text, tsMs: this.elapsedMs() });
          this.bufferTranscript("meeting", text);
          if (text.includes(this.agent.wakeWord)) {
            this.responseWindowOpen = true;
            this.broadcastEvent({ type: "agent_state", state: "thinking", tsMs: this.elapsedMs() });
          }
        },
        onOutputTranscript: (text) => {
          this.broadcastEvent({ type: "transcript", speaker: this.agent.name, text, tsMs: this.elapsedMs() });
          this.bufferTranscript(this.agent.name, text);
        },
        onTurnComplete: () => {
          this.responseWindowOpen = false;
          this.broadcastEvent({ type: "agent_state", state: "listening", tsMs: this.elapsedMs() });
        },
        onError: (err) => {
          console.error(`[session ${this.meetingId}] engine error`, err);
          this.broadcastEvent({ type: "error", text: err.message, tsMs: this.elapsedMs() });
        },
      },
    );

    this.broadcastEvent({ type: "agent_state", state: "listening", tsMs: this.elapsedMs() });
  }

  /** Recall.ai からの会議音声（PCM16/16kHz を想定） */
  onMeetingAudio(pcm: Buffer): void {
    this.engine?.sendAudio(pcm);
  }

  attachOutput(ws: WebSocket): void {
    this.attach(this.outputSockets, ws);
  }

  attachDashboard(ws: WebSocket): void {
    this.attach(this.dashboardSockets, ws);
  }

  private attach(pool: Set<WebSocket>, ws: WebSocket): void {
    this.cancelDispose();
    pool.add(ws);
    ws.on("close", () => {
      pool.delete(ws);
      this.scheduleDisposeIfIdle();
    });
  }

  /** 全接続が消えても一定時間はエンジンを維持する（再接続に備える） */
  scheduleDisposeIfIdle(): void {
    if (this.outputSockets.size > 0 || this.dashboardSockets.size > 0) return;
    this.cancelDispose();
    this.disposeTimer = setTimeout(() => void this.dispose(), config.sessionKeepAliveMs);
  }

  private cancelDispose(): void {
    if (this.disposeTimer) clearTimeout(this.disposeTimer);
    this.disposeTimer = null;
  }

  private bufferTranscript(speaker: string, fragment: string): void {
    let buf = this.transcriptBuffers.get(speaker);
    if (!buf) {
      buf = new TranscriptBuffer((text, tsMs) => {
        void persistTranscriptSegment(this.meetingId, speaker, text, tsMs);
      });
      this.transcriptBuffers.set(speaker, buf);
    }
    buf.append(fragment, this.elapsedMs());
  }

  async dispose(): Promise<void> {
    this.cancelDispose();
    for (const buf of this.transcriptBuffers.values()) buf.flush();
    await this.engine?.close();
    this.engine = null;
    sessions.delete(this.meetingId);
    console.log(`[session ${this.meetingId}] disposed`);
  }

  private elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  private broadcastBinary(pool: Set<WebSocket>, data: Buffer): void {
    for (const ws of pool) if (ws.readyState === ws.OPEN) ws.send(data);
  }

  private broadcastEvent(event: DashboardEvent): void {
    const json = JSON.stringify(event);
    for (const ws of this.dashboardSockets) if (ws.readyState === ws.OPEN) ws.send(json);
  }
}

export const sessions = new Map<string, MeetingSession>();

export async function getOrCreateSession(meetingId: string, agent: AgentProfile): Promise<MeetingSession> {
  let s = sessions.get(meetingId);
  if (!s) {
    s = new MeetingSession(meetingId, agent);
    sessions.set(meetingId, s);
    await s.start();
  }
  return s;
}
