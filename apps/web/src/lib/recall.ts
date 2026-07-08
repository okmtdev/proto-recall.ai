import { signGatewayToken } from "./gatewayToken";

const RECALL_BASE = `https://${process.env.RECALL_REGION ?? "ap-northeast-1"}.recall.ai/api/v1`;

/**
 * Recall.ai にボットを作成して Meet に参加させる。
 * ペイロードの各フィールドは https://docs.recall.ai/reference/bot_create を正とする。
 * TODO(M1): 初回の実打ちでフィールド名・イベント名を docs と突き合わせて固定する
 */
export async function createRecallBot(params: {
  meetingId: string;
  meetingUrl: string;
  botName: string;
}): Promise<{ botId: string }> {
  const gatewayUrl = process.env.GATEWAY_URL ?? "";
  const wsBase = gatewayUrl.replace(/^https:/, "wss:");
  const token = signGatewayToken(params.meetingId);
  const q = `meeting=${encodeURIComponent(params.meetingId)}&token=${encodeURIComponent(token)}`;

  const body = {
    meeting_url: params.meetingUrl,
    bot_name: params.botName,
    recording_config: {
      // 生音声（ミックス済み）を gateway へリアルタイム送信
      audio_mixed_raw: {},
      realtime_endpoints: [
        {
          type: "websocket",
          url: `${wsBase}/ws/recall?${q}`,
          events: ["audio_mixed_raw.data"],
        },
      ],
      // 文字起こしは MVP では Meet のキャプション流用（安価・日本語対応）
      transcript: { provider: { meeting_captions: {} } },
    },
    // ボットの見た目と声: gateway が配信する Output Media ページ
    output_media: {
      camera: { kind: "webpage", config: { url: `${gatewayUrl}/output-media?${q}` } },
    },
    // コスト暴走ガード（置き忘れボットの課金防止）
    automatic_leave: {
      waiting_room_timeout: 900,
      noone_joined_timeout: 900,
      everyone_left_timeout: 60,
    },
  };

  const res = await fetch(`${RECALL_BASE}/bot`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Recall.ai は Authorization ヘッダに API キーをそのまま渡す方式
      authorization: process.env.RECALL_API_KEY ?? "",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Recall bot create failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { id: string };
  return { botId: json.id };
}

/** ボットを会議から退出させる */
export async function leaveRecallBot(botId: string): Promise<void> {
  const res = await fetch(`${RECALL_BASE}/bot/${botId}/leave_call`, {
    method: "POST",
    headers: { authorization: process.env.RECALL_API_KEY ?? "" },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Recall bot leave failed: ${res.status} ${await res.text()}`);
  }
}
