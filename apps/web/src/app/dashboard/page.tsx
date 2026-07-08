import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { estimateCostUsd } from "@/lib/cost";
import { getOrCreateAgent, listMeetings } from "@/lib/db";
import { inviteBotAction, saveAgentAction } from "./actions";

const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #e3e6f0",
  borderRadius: 12,
  padding: 20,
  marginBottom: 20,
};
const input: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ccd",
  marginTop: 4,
  marginBottom: 12,
  fontSize: 14,
};

export default async function Dashboard() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const agent = await getOrCreateAgent(userId);
  const meetings = await listMeetings(userId);

  const now = new Date();
  const monthlyCost = meetings
    .filter((m) => m.created_at.getFullYear() === now.getFullYear() && m.created_at.getMonth() === now.getMonth())
    .reduce((sum, m) => sum + (estimateCostUsd(m.started_at, m.ended_at) ?? 0), 0);

  return (
    <main>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22 }}>proto-recall.ai</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" style={{ border: "none", background: "none", color: "#667", cursor: "pointer" }}>
            {session?.user?.email} · ログアウト
          </button>
        </form>
      </header>

      <section style={card}>
        <h2 style={{ marginTop: 0, fontSize: 17 }}>ボットを会議に呼ぶ</h2>
        <form action={inviteBotAction}>
          <label>
            Google Meet の URL
            <input name="meetingUrl" placeholder="https://meet.google.com/xxx-xxxx-xxx" style={input} required />
          </label>
          <button type="submit" style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#3b5bdb", color: "#fff", cursor: "pointer" }}>
            参加させる
          </button>
          <p style={{ color: "#667", fontSize: 13 }}>
            ボットは待機室に入ります。会議の主催者が入室を許可してください。
          </p>
        </form>
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0, fontSize: 17 }}>エージェント設定</h2>
        <form action={saveAgentAction}>
          <label>
            名前（この名前で呼びかけると応答します）
            <input name="name" defaultValue={agent.name} style={input} required />
          </label>
          <label>
            システムプロンプト（人格・役割）
            <textarea name="systemPrompt" defaultValue={agent.system_prompt} rows={4} style={input} />
          </label>
          <label>
            対話エンジン
            <select name="engine" defaultValue={agent.engine} style={{ ...input, width: "auto" }}>
              <option value="gemini">Gemini Live API（既定・安価）</option>
              <option value="openai">OpenAI Realtime（要 API キー設定）</option>
            </select>
          </label>
          <div>
            <button type="submit" style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #ccd", background: "#fff", cursor: "pointer" }}>
              保存
            </button>
          </div>
        </form>
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0, fontSize: 17 }}>
          会議履歴
          <span style={{ marginLeft: 12, fontSize: 13, fontWeight: "normal", color: "#667" }}>
            今月の概算コスト: ${monthlyCost.toFixed(2)}
          </span>
        </h2>
        {meetings.length === 0 && <p style={{ color: "#667" }}>まだありません</p>}
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {meetings.map((m) => {
            const cost = estimateCostUsd(m.started_at, m.ended_at);
            return (
              <li key={m.id} style={{ padding: "10px 0", borderBottom: "1px solid #eef" }}>
                <Link href={`/dashboard/meetings/${m.id}`} style={{ color: "#3b5bdb", textDecoration: "none" }}>
                  {m.meeting_url}
                </Link>
                <span style={{ marginLeft: 8, fontSize: 12, color: "#667" }}>
                  [{m.status}] {new Date(m.created_at).toLocaleString("ja-JP")}
                  {cost !== null ? ` · 約 $${cost.toFixed(2)}` : ""}
                  {m.minutes ? " · 📝議事録あり" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
