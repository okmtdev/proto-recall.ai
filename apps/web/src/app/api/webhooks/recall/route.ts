import { NextResponse } from "next/server";
import { updateMeetingStatusByBot } from "@/lib/db";

/**
 * Recall.ai の bot status change Webhook 受信。
 * ダッシュボード（Recall 側）でこの URL を登録する: <web_url>/api/webhooks/recall
 * TODO(M2): Svix 署名検証を入れる（https://docs.recall.ai/docs/bot-status-change-events）
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      event?: string;
      data?: { bot_id?: string; status?: { code?: string } };
    };

    const botId = body.data?.bot_id;
    const code = body.data?.status?.code ?? "";
    if (botId && code) {
      const status = code.includes("in_call")
        ? "in_call"
        : code === "done" || code === "call_ended"
          ? "done"
          : code === "fatal"
            ? "failed"
            : null;
      if (status) await updateMeetingStatusByBot(botId, status);
    }
  } catch (err) {
    console.error("[webhook] parse failed", err);
  }
  // Recall 側のリトライ暴走を避けるため常に 200
  return NextResponse.json({ ok: true });
}
