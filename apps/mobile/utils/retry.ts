/* eslint-disable complexity -- pre-existing; tracked in docs/tech-debt.md (retry loop branches on attempt count, abort, and retry predicate) */
/**
 * Retry utility for network requests and fallible operations.
 *
 * Exponential backoff with jitter. Respects abort signals.
 */

/**
 * Configuration for {@link withRetry} backoff behavior.
 */
export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms between retries. Default: 1000 */
  baseDelay?: number;
  /** Maximum delay in ms. Default: 10000 */
  maxDelay?: number;
  /** AbortSignal to cancel retries */
  signal?: AbortSignal;
  /** Only retry on these error conditions */
  retryIf?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "signal" | "retryIf">> = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
};

/**
 * Execute a function with automatic retry on failure.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    if (options?.signal?.aborted) {
      throw new Error("Aborted");
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry this specific error
      if (options?.retryIf && !options.retryIf(error)) {
        throw error;
      }

      // Don't delay after the last attempt
      if (attempt < opts.maxAttempts) {
        const delay = Math.min(
          opts.baseDelay * Math.pow(2, attempt - 1) +
            Math.random() * opts.baseDelay * 0.5, // jitter
          opts.maxDelay,
        );
        await sleep(delay, options?.signal);
      }
    }
  }

  throw lastError;
}

/**
 * Fetch with automatic retry for transient network errors.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  retryOptions?: RetryOptions,
): Promise<Response> {
  return withRetry(
    async () => {
      const response = await fetch(url, init);
      // Retry on server errors (5xx) but not client errors (4xx)
      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }
      return response;
    },
    {
      ...retryOptions,
      retryIf: (error) => {
        // Retry network errors and 5xx responses
        if (error instanceof TypeError) return true; // Network error
        if (error instanceof Error && error.message.startsWith("Server error")) return true;
        return false;
      },
    },
  );
}

/**
 * Resolves after the given delay, rejecting early if the signal aborts.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    });
  });
}
