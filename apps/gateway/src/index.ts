import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { assertServerConfig, config } from "./config.js";
import { getAgentForMeeting } from "./db.js";
import { extractAudioChunk } from "./recall.js";
import { getOrCreateSession, sessions } from "./session.js";
import { verifyToken } from "./token.js";

assertServerConfig();

const outputMediaHtml = readFileSync(
  fileURLToPath(new URL("../public/output-media.html", import.meta.url)),
  "utf8",
);

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, sessions: sessions.size }));
    return;
  }

  // Recall.ai ボットの Chromium が開く Output Media ページ
  if (url.pathname === "/output-media") {
    const meetingId = url.searchParams.get("meeting") ?? "";
    const token = url.searchParams.get("token") ?? "";
    if (!verifyToken(token, meetingId, config.signingSecret)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(outputMediaHtml);
    return;
  }

  res.writeHead(404).end("not found");
});

const wss = new WebSocketServer({ noServer: true });

type WsRole = "recall" | "output" | "dashboard";
const wsPaths: Record<string, WsRole> = {
  "/ws/recall": "recall",
  "/ws/output": "output",
  "/ws/dashboard": "dashboard",
};

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const role = wsPaths[url.pathname];
  const meetingId = url.searchParams.get("meeting") ?? "";
  const token = url.searchParams.get("token") ?? "";

  if (!role || !verifyToken(token, meetingId, config.signingSecret)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    void handleConnection(ws, role, meetingId).catch((err) => {
      console.error(`[ws ${role}] setup failed`, err);
      ws.close(1011, "internal error");
    });
  });
});

async function handleConnection(ws: WebSocket, role: WsRole, meetingId: string): Promise<void> {
  const agent = await getAgentForMeeting(meetingId);
  const session = await getOrCreateSession(meetingId, agent);
  console.log(`[ws ${role}] connected meeting=${meetingId}`);

  switch (role) {
    case "recall":
      // Recall.ai → 会議音声。切断されても Recall 側が自動再接続してくる（3秒間隔×最大30回）
      ws.on("message", (raw: Buffer, isBinary: boolean) => {
        const pcm = extractAudioChunk(isBinary ? raw : raw.toString("utf8"));
        if (pcm) session.onMeetingAudio(pcm);
      });
      ws.on("close", () => session.scheduleDisposeIfIdle());
      break;
    case "output":
      session.attachOutput(ws);
      break;
    case "dashboard":
      session.attachDashboard(ws);
      break;
  }
}

server.listen(config.port, () => {
  console.log(`gateway listening on :${config.port}`);
});

// Cloud Run からの SIGTERM で行儀よく終了する
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, disposing sessions...");
  await Promise.allSettled([...sessions.values()].map((s) => s.dispose()));
  server.close(() => process.exit(0));
});
