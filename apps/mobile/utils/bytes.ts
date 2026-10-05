/**
 * Human-readable sizes for downloads.
 */

/**
 * Format a byte count for display, e.g. `"138.5 MB"`.
 *
 * @param bytes - The size in bytes.
 * @returns The size in KB, MB or GB.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
