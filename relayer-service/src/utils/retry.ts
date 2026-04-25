import { logger } from "../logger";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RetryOptions {
  maxRetries:   number;
  delayMs:      number;
  backoffFactor: number; // multiplier per attempt (2 = exponential)
  label:        string;  // for logging
}

// ─── Retry with Exponential Backoff ──────────────────────────────────────────

/**
 * Retry an async operation with exponential backoff.
 *
 * Example: maxRetries=5, delayMs=2000, backoffFactor=2
 *   Attempt 1 fails → wait 2s
 *   Attempt 2 fails → wait 4s
 *   Attempt 3 fails → wait 8s
 *   Attempt 4 fails → wait 16s
 *   Attempt 5 fails → throw
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxRetries, delayMs, backoffFactor, label } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === maxRetries;
      const waitMs = delayMs * Math.pow(backoffFactor, attempt - 1);
      const message =
        error instanceof Error ? error.message : String(error);

      if (isLastAttempt) {
        logger.error(`[${label}] All ${maxRetries} attempts failed`, {
          error: message,
        });
        break;
      }

      logger.warn(
        `[${label}] Attempt ${attempt}/${maxRetries} failed — retrying in ${waitMs}ms`,
        { error: message }
      );

      await sleep(waitMs);
    }
  }

  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}