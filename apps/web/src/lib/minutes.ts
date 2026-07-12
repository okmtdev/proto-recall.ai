import { getTranscript, setMeetingMinutes, type MinutesData } from "./db";

// 議事録生成はリアルタイム性不要なのでバッチ向けの安価なモデルを使う
const MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";

/**
 * 保存済みの文字起こしから議事録（要約・決定事項・アクションアイテム）を生成して
 * meetings.minutes に保存する。文字起こしが無ければ null。
 * 呼び出し元: Recall Webhook（会議終了時）とダッシュボードの再生成ボタン。
 */
export async function generateAndStoreMinutes(meetingId: string): Promise<MinutesData | null> {
  const segments = await getTranscript(meetingId);
  if (segments.length === 0) return null;

  const transcript = segments
    .map((s) => `${s.speaker ?? "?"}: ${s.text}`)
    .join("\n")
    .slice(0, 100_000); // Flash のコンテキストには余裕があるが、コスト上限として切る

  const prompt = [
    "あなたは優秀な書記です。以下は会議の文字起こしです。",
    "次の JSON 形式で議事録を日本語で出力してください:",
    `{"summary": "会議全体の要約（3〜6文）", "decisions": ["決定事項"], "actionItems": [{"task": "やること", "owner": "担当（分かれば）", "due": "期限（分かれば）"}]}`,
    "決定事項・アクションアイテムが無ければ空配列にしてください。推測で埋めないこと。",
    "---",
    transcript,
  ].join("\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini minutes generation failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let parsed: MinutesData;
  try {
    parsed = JSON.parse(text) as MinutesData;
  } catch {
    // JSON で返らなかった場合も要約としては使えるので summary に落とす
    parsed = { summary: text };
  }

  const minutes: MinutesData = {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(String) : [],
    actionItems: Array.isArray(parsed.actionItems)
      ? parsed.actionItems.map((a) => ({
          task: a?.task ? String(a.task) : "",
          owner: a?.owner ? String(a.owner) : undefined,
          due: a?.due ? String(a.due) : undefined,
        }))
      : [],
    generatedAt: new Date().toISOString(),
  };

  await setMeetingMinutes(meetingId, minutes);
  return minutes;
}
