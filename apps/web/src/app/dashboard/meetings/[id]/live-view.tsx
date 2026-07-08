"use client";

import { useEffect, useRef, useState } from "react";

interface TranscriptItem {
  speaker?: string;
  text?: string;
  state?: string;
  type: string;
  tsMs: number;
}

export function LiveView({ wsUrl }: { wsUrl: string }) {
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [agentState, setAgentState] = useState("connecting…");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;

    function connect() {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as TranscriptItem;
          if (msg.type === "transcript") setItems((prev) => [...prev.slice(-500), msg]);
          if (msg.type === "agent_state" && msg.state) setAgentState(msg.state);
          if (msg.type === "error") setAgentState(`error: ${msg.text}`);
        } catch {
          /* バイナリや不正フレームは無視 */
        }
      };
      ws.onclose = () => {
        // gateway 側の切断（Cloud Run 60分など）に備えて繋ぎ直す
        if (!closed) setTimeout(connect, 1500);
      };
    }
    connect();

    return () => {
      closed = true;
      ws?.close();
    };
  }, [wsUrl]);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [items]);

  return (
    <div>
      <p>
        エージェント状態: <strong>{agentState}</strong>
      </p>
      <div
        style={{
          background: "#fff",
          border: "1px solid #e3e6f0",
          borderRadius: 12,
          padding: 16,
          height: 420,
          overflowY: "auto",
          fontSize: 14,
        }}
      >
        {items.length === 0 && <p style={{ color: "#889" }}>文字起こし待機中…（ボットの入室を許可してください）</p>}
        {items.map((t, i) => (
          <p key={i} style={{ margin: "6px 0" }}>
            <strong style={{ color: t.speaker === "meeting" ? "#556" : "#3b5bdb" }}>
              {t.speaker === "meeting" ? "会議" : t.speaker}
            </strong>
            : {t.text}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
