import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * web ↔ gateway 間で使う短命トークン。
 * 形式: base64url(meetingId:expiresEpochMs):hex(hmacSha256(secret, "meetingId:expiresEpochMs"))
 * web 側 (apps/web/src/lib/gatewayToken.ts) と対になっている。
 */
export function verifyToken(token: string, meetingId: string, secret: string): boolean {
  try {
    const [payloadB64, mac] = token.split(":");
    if (!payloadB64 || !mac) return false;
    const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
    const [tokenMeetingId, expiresStr] = payload.split("|");
    if (tokenMeetingId !== meetingId) return false;
    if (Number(expiresStr) < Date.now()) return false;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    const a = Buffer.from(mac, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function signToken(meetingId: string, secret: string, ttlMs = 6 * 60 * 60 * 1000): string {
  const payload = `${meetingId}|${Date.now() + ttlMs}`;
  const mac = createHmac("sha256", secret).update(payload).digest("hex");
  return `${Buffer.from(payload, "utf8").toString("base64url")}:${mac}`;
}
