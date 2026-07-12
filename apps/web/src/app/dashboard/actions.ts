"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createMeeting, getMeeting, getOrCreateAgent, setMeetingBot, updateAgent } from "@/lib/db";
import { generateAndStoreMinutes } from "@/lib/minutes";
import { createRecallBot } from "@/lib/recall";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");
  return userId;
}

export async function saveAgentAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  await updateAgent(userId, {
    name: String(formData.get("name") ?? "リコールさん").trim(),
    systemPrompt: String(formData.get("systemPrompt") ?? "").trim(),
    engine: String(formData.get("engine") ?? "gemini"),
    announceOnJoin: formData.get("announceOnJoin") === "on",
  });
  redirect("/dashboard");
}

export async function inviteBotAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const meetingUrl = String(formData.get("meetingUrl") ?? "").trim();
  if (!/^https:\/\/meet\.google\.com\//.test(meetingUrl)) {
    throw new Error("Google Meet の URL を入力してください（https://meet.google.com/...）");
  }

  const agent = await getOrCreateAgent(userId);
  const meetingId = await createMeeting(userId, agent.id, meetingUrl);
  const { botId } = await createRecallBot({ meetingId, meetingUrl, botName: agent.name });
  await setMeetingBot(meetingId, botId);

  redirect(`/dashboard/meetings/${meetingId}`);
}

/** 議事録の手動（再）生成。Webhook を取りこぼした場合や会議途中でも使える */
export async function generateMinutesAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const meetingId = String(formData.get("meetingId") ?? "");
  const meeting = await getMeeting(userId, meetingId);
  if (!meeting) redirect("/dashboard");
  await generateAndStoreMinutes(meetingId);
  redirect(`/dashboard/meetings/${meetingId}`);
}
