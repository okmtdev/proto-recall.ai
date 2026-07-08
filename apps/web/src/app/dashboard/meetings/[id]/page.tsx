import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMeeting } from "@/lib/db";
import { signGatewayToken } from "@/lib/gatewayToken";
import { LiveView } from "./live-view";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const meeting = await getMeeting(userId, id);
  if (!meeting) redirect("/dashboard");

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
      <h1 style={{ fontSize: 20 }}>ライブビュー</h1>
      <p style={{ color: "#667", fontSize: 14 }}>
        {meeting.meeting_url}（status: {meeting.status}）
      </p>
      <LiveView wsUrl={wsUrl} />
    </main>
  );
}
