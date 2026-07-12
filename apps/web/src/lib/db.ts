import { Pool } from "pg";

declare global {
  // Next.js のホットリロードでプールが増殖しないように global に保持
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export const pool: Pool =
  globalThis.__pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
globalThis.__pgPool = pool;

export async function upsertUser(u: {
  googleSub: string;
  email: string;
  name: string | null;
}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into users (google_sub, email, name) values ($1, $2, $3)
     on conflict (google_sub) do update set email = excluded.email, name = excluded.name
     returning id`,
    [u.googleSub, u.email, u.name],
  );
  return rows[0].id;
}

export interface AgentRow {
  id: string;
  name: string;
  wake_word: string;
  system_prompt: string;
  language: string;
  engine: "gemini" | "openai";
  voice: string | null;
  announce_on_join: boolean;
}

export async function getOrCreateAgent(userId: string): Promise<AgentRow> {
  const found = await pool.query<AgentRow>(
    `select id, name, wake_word, system_prompt, language, engine, voice, announce_on_join
       from agents where user_id = $1 order by created_at limit 1`,
    [userId],
  );
  if (found.rows.length > 0) return found.rows[0];
  const created = await pool.query<AgentRow>(
    `insert into agents (user_id) values ($1)
     returning id, name, wake_word, system_prompt, language, engine, voice, announce_on_join`,
    [userId],
  );
  return created.rows[0];
}

export async function updateAgent(
  userId: string,
  agent: { name: string; systemPrompt: string; engine: string; announceOnJoin: boolean },
): Promise<void> {
  await pool.query(
    `update agents set name = $2, wake_word = $2, system_prompt = $3, engine = $4, announce_on_join = $5
      where user_id = $1`,
    [
      userId,
      agent.name,
      agent.systemPrompt,
      agent.engine === "openai" ? "openai" : "gemini",
      agent.announceOnJoin,
    ],
  );
}

export interface MinutesData {
  summary?: string;
  decisions?: string[];
  actionItems?: { task?: string; owner?: string; due?: string }[];
  generatedAt?: string;
}

export interface MeetingRow {
  id: string;
  meeting_url: string;
  recall_bot_id: string | null;
  status: string;
  started_at: Date | null;
  ended_at: Date | null;
  minutes: MinutesData | null;
  created_at: Date;
}

export interface TranscriptRow {
  speaker: string | null;
  text: string;
  ts_ms: string; // bigint は pg では文字列で返る
}

export async function createMeeting(
  userId: string,
  agentId: string,
  meetingUrl: string,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into meetings (user_id, agent_id, meeting_url) values ($1, $2, $3) returning id`,
    [userId, agentId, meetingUrl],
  );
  return rows[0].id;
}

export async function setMeetingBot(meetingId: string, botId: string): Promise<void> {
  await pool.query(`update meetings set recall_bot_id = $2 where id = $1`, [meetingId, botId]);
}

export async function listMeetings(userId: string): Promise<MeetingRow[]> {
  const { rows } = await pool.query<MeetingRow>(
    `select id, meeting_url, recall_bot_id, status, started_at, ended_at, minutes, created_at
       from meetings where user_id = $1 order by created_at desc limit 50`,
    [userId],
  );
  return rows;
}

export async function getMeeting(userId: string, meetingId: string): Promise<MeetingRow | null> {
  const { rows } = await pool.query<MeetingRow>(
    `select id, meeting_url, recall_bot_id, status, started_at, ended_at, minutes, created_at
       from meetings where user_id = $1 and id = $2`,
    [userId, meetingId],
  );
  return rows[0] ?? null;
}

export async function getMeetingIdByBot(botId: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `select id from meetings where recall_bot_id = $1`,
    [botId],
  );
  return rows[0]?.id ?? null;
}

export async function getTranscript(meetingId: string): Promise<TranscriptRow[]> {
  const { rows } = await pool.query<TranscriptRow>(
    `select speaker, text, ts_ms from transcript_segments
      where meeting_id = $1 order by ts_ms, id limit 5000`,
    [meetingId],
  );
  return rows;
}

export async function setMeetingMinutes(meetingId: string, minutes: MinutesData): Promise<void> {
  await pool.query(`update meetings set minutes = $2 where id = $1`, [
    meetingId,
    JSON.stringify(minutes),
  ]);
}

export async function updateMeetingStatusByBot(botId: string, status: string): Promise<void> {
  const col = status === "in_call" ? "started_at" : status === "done" ? "ended_at" : null;
  await pool.query(
    `update meetings set status = $2${col ? `, ${col} = now()` : ""} where recall_bot_id = $1`,
    [botId, status],
  );
}
