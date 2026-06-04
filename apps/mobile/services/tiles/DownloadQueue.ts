/**
 * Download Queue
 *
 * Manages sequential tile downloads with pause/resume support.
 * Only one download active at a time to avoid overwhelming the connection.
 */

import { downloadRegion, type DownloadProgress } from "./TileManager";

import type { Region } from "@bugrout/shared";

/** A queued region download with its progress and settlement callbacks. */
interface QueueItem {
  region: Region;
  onProgress?: ((progress: DownloadProgress) => void) | undefined;
  resolve: () => void;
  reject: (error: Error) => void;
}

const queue: QueueItem[] = [];
let isProcessing = false;
let isPaused = false;

/**
 * Live read of the pause flag. Used after an `await` where the flag may have been
 * flipped concurrently by pauseDownloads(), defeating stale control-flow narrowing.
 */
function isPausedNow(): boolean {
  return isPaused;
}

/**
 * Add a region to the download queue.
 */
export function enqueueDownload(
  region: Region,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    queue.push({ region, onProgress, resolve, reject });
    void processQueue();
  });
}

/**
 * Pause all downloads.
 */
export function pauseDownloads(): void {
  isPaused = true;
}

/**
 * Resume downloads.
 */
export function resumeDownloads(): void {
  isPaused = false;
  void processQueue();
}

/**
 * Cancel all pending downloads.
 */
export function cancelAllDownloads(): void {
  const pending = queue.splice(0);
  for (const item of pending) {
    item.reject(new Error("Download cancelled"));
  }
  isPaused = false;
  isProcessing = false;
}

/**
 * Get the number of items in the queue.
 */
export function getQueueLength(): number {
  return queue.length;
}

/**
 * Process the next queued download, one at a time, honoring pause state.
 */
async function processQueue(): Promise<void> {
  if (isProcessing || isPaused || queue.length === 0) return;

  isProcessing = true;
  const item = queue[0];
  if (!item) {
    isProcessing = false;
    return;
  }

  try {
    await downloadRegion(item.region, item.onProgress);
    queue.shift();
    item.resolve();
  } catch (error) {
    queue.shift();
    item.reject(error instanceof Error ? error : new Error("Download failed"));
  } finally {
    isProcessing = false;
    // Process next item
    if (queue.length > 0 && !isPausedNow()) {
      void processQueue();
    }
  }
}
