-- proto-recall.ai schema
-- 適用: psql "$DATABASE_URL" -f db/schema.sql（初回のみ。マイグレーションツール導入は M2 以降）

create extension if not exists pgcrypto;

create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  google_sub  text not null unique,
  email       text not null,
  name        text,
  created_at  timestamptz not null default now()
);

create table if not exists agents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  name          text not null default 'リコールさん',
  wake_word     text not null default 'リコールさん',
  system_prompt text not null default 'あなたは会議アシスタントです。名前を呼ばれたときだけ、簡潔な日本語で答えてください。',
  language      text not null default 'ja',
  engine        text not null default 'gemini' check (engine in ('gemini', 'openai')),
  voice         text,
  -- 入室時に「録音中です」と一言アナウンスする（同意取得・コンプライアンス用）
  announce_on_join boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists meetings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  agent_id      uuid references agents(id) on delete set null,
  meeting_url   text not null,
  recall_bot_id text unique,
  status        text not null default 'joining'
                check (status in ('joining', 'in_call', 'done', 'failed')),
  started_at    timestamptz,
  ended_at      timestamptz,
  -- 会議終了時に自動生成される議事録 { summary, decisions[], actionItems[], generatedAt }
  minutes       jsonb,
  created_at    timestamptz not null default now()
);

create table if not exists transcript_segments (
  id         bigserial primary key,
  meeting_id uuid not null references meetings(id) on delete cascade,
  speaker    text,
  text       text not null,
  ts_ms      bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_meetings_user on meetings(user_id, created_at desc);
create index if not exists idx_segments_meeting on transcript_segments(meeting_id, ts_ms);
