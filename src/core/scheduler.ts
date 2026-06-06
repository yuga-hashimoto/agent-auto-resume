import { SessionState } from "./types.js";

/**
 * セッション再開までの待機時間（ミリ秒）を計算する。
 * @param state セッション状態
 * @returns 待機時間（ミリ秒）。既に経過している場合は 0 以下の数値。
 */
export function getWaitMs(state: SessionState): number {
  if (!state.resetAt) {
    return 0;
  }
  const resetTime = new Date(state.resetAt).getTime();
  const bufferMs = (state.bufferSeconds ?? 120) * 1000;
  const targetTime = resetTime + bufferMs;
  const now = Date.now();
  return targetTime - now;
}

/**
 * 指定時間、ポーリングを挟みながら非同期に待機する。
 * AbortSignalが渡された場合は、途中で中断可能。
 * @param ms 待機時間（ミリ秒）
 * @param abortSignal 中断シグナル
 */
export async function waitMs(ms: number, abortSignal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;

  const start = Date.now();
  // 60秒以下でも、より細かく1秒毎にポーリングして中断を確認する
  const checkInterval = 1000;

  while (Date.now() - start < ms) {
    if (abortSignal?.aborted) {
      break;
    }
    const remaining = ms - (Date.now() - start);
    const sleepTime = Math.min(remaining, checkInterval);
    await new Promise((resolve) => setTimeout(resolve, sleepTime));
  }
}
