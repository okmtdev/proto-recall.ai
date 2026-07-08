import { createHmac } from "node:crypto";

/** gateway (apps/gateway/src/token.ts) と対になる署名。形式を変えるときは両方変えること */
export function signGatewayToken(
  meetingId: string,
  ttlMs = 6 * 60 * 60 * 1000,
): string {
  const secret = process.env.GATEWAY_SIGNING_SECRET ?? "";
  const payload = `${meetingId}|${Date.now() + ttlMs}`;
  const mac = createHmac("sha256", secret).update(payload).digest("hex");
  return `${Buffer.from(payload, "utf8").toString("base64url")}:${mac}`;
}
