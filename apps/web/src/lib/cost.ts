/**
 * 会議1時間あたりの概算コスト（USD）。内訳:
 * Recall.ai ボット $0.50 + 文字起こし $0.15 + Gemini Live 〜$0.5 + Cloud Run 〜$0.2
 * あくまで目安（docs/spec.md のコスト方針を参照）。
 */
const RATE_USD_PER_HOUR = 1.35;

export function estimateCostUsd(startedAt: Date | null, endedAt: Date | null): number | null {
  if (!startedAt || !endedAt) return null;
  const hours = (endedAt.getTime() - startedAt.getTime()) / 3_600_000;
  if (hours <= 0) return null;
  return Math.round(hours * RATE_USD_PER_HOUR * 100) / 100;
}

export function formatDurationMin(startedAt: Date | null, endedAt: Date | null): string | null {
  if (!startedAt || !endedAt) return null;
  const min = Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000);
  return min >= 0 ? `${min}分` : null;
}
