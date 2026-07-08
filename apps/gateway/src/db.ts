import pg from "pg";
import { config } from "./config.js";
import type { AgentProfile } from "./session.js";

const pool = config.databaseUrl ? new pg.Pool({ connectionString: config.databaseUrl, max: 3 }) : null;

const fallbackProfile: AgentProfile = {
  name: "リコールさん",
  wakeWord: "リコールさん",
  systemPrompt: "あなたは会議アシスタントです。名前を呼ばれたときだけ、簡潔な日本語で答えてください。",
  language: "ja",
  engine: "gemini",
};

/** meetings.id からエージェント設定を引く。DB 未設定（ローカル検証）時は既定プロファイル */
export async function getAgentForMeeting(meetingId: string): Promise<AgentProfile> {
  if (!pool) return fallbackProfile;
  const { rows } = await pool.query(
    `select a.name, a.wake_word, a.system_prompt, a.language, a.engine, a.voice
       from meetings m join agents a on a.id = m.agent_id
      where m.id = $1`,
    [meetingId],
  );
  if (rows.length === 0) return fallbackProfile;
  const r = rows[0];
  return {
    name: r.name,
    wakeWord: r.wake_word,
    systemPrompt: r.system_prompt,
    language: r.language,
    engine: r.engine === "openai" ? "openai" : "gemini",
    voice: r.voice ?? undefined,
  };
}
