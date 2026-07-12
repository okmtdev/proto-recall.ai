import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMeeting, getTranscript } from "@/lib/db";
import { estimateCostUsd, formatDurationMin } from "@/lib/cost";
import { signGatewayToken } from "@/lib/gatewayToken";
import { generateMinutesAction } from "../../actions";
import { LiveView } from "./live-view";

const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #e3e6f0",
  borderRadius: 12,
  padding: 20,
  marginBottom: 20,
};

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const meeting = await getMeeting(userId, id);
  if (!meeting) redirect("/dashboard");

  const finished = meeting.status === "done" || meeting.status === "failed";
  const minutes = meeting.minutes;
  const cost = estimateCostUsd(meeting.started_at, meeting.ended_at);
  const duration = formatDurationMin(meeting.started_at, meeting.ended_at);
  const transcript = finished ? await getTranscript(meeting.id) : [];

  const gatewayUrl = process.env.GATEWAY_URL ?? "";
  const token = signGatewayToken(meeting.id);
  const wsUrl = `${gatewayUrl.replace(/^https:/, "wss:")}/ws/dashboard?meeting=${encodeURIComponent(meeting.id)}&token=${encodeURIComponent(token)}`;

  return (
    <main>
      <p>
        <Link href="/dashboard" style={{ color: "#3b5bdb", textDecoration: "none" }}>
          ← ダッシュボード
        </Link>
      </p>
      <h1 style={{ fontSize: 20 }}>{finished ? "会議の記録" : "ライブビュー"}</h1>
      <p style={{ color: "#667", fontSize: 14 }}>
        {meeting.meeting_url}（status: {meeting.status}
        {duration ? ` / ${duration}` : ""}
        {cost !== null ? ` / 概算コスト $${cost.toFixed(2)}` : ""}）
      </p>

      {minutes && (
        <section style={card}>
          <h2 style={{ marginTop: 0, fontSize: 17 }}>📝 議事録（自動生成）</h2>
          {minutes.summary && <p style={{ whiteSpace: "pre-wrap" }}>{minutes.summary}</p>}
          {(minutes.decisions?.length ?? 0) > 0 && (
            <>
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>決定事項</h3>
              <ul style={{ marginTop: 0 }}>
                {minutes.decisions!.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </>
          )}
          {(minutes.actionItems?.length ?? 0) > 0 && (
            <>
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>アクションアイテム</h3>
              <ul style={{ marginTop: 0 }}>
                {minutes.actionItems!.map((a, i) => (
                  <li key={i}>
                    {a.task}
                    {a.owner ? `（担当: ${a.owner}）` : ""}
                    {a.due ? `〆${a.due}` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
          {minutes.generatedAt && (
            <p style={{ color: "#889", fontSize: 12 }}>
              生成: {new Date(minutes.generatedAt).toLocaleString("ja-JP")}
            </p>
          )}
        </section>
      )}

      <form action={generateMinutesAction} style={{ marginBottom: 20 }}>
        <input type="hidden" name="meetingId" value={meeting.id} />
        <button
          type="submit"
          style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccd", background: "#fff", cursor: "pointer" }}
        >
          {minutes ? "議事録を再生成" : "議事録をいま生成する"}
        </button>
      </form>

      {finished ? (
        <section style={card}>
          <h2 style={{ marginTop: 0, fontSize: 17 }}>文字起こし全文</h2>
          {transcript.length === 0 && <p style={{ color: "#667" }}>文字起こしがありません</p>}
          {transcript.map((t, i) => (
            <p key={i} style={{ margin: "6px 0", fontSize: 14 }}>
              <strong style={{ color: t.speaker === "meeting" ? "#556" : "#3b5bdb" }}>
                {t.speaker === "meeting" ? "会議" : (t.speaker ?? "?")}
              </strong>
              : {t.text}
            </p>
          ))}
        </section>
      ) : (
        <LiveView wsUrl={wsUrl} />
      )}
    </main>
  );
}
