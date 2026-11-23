/**
 * Sharing a file through the system share sheet (a backup
 * is offered via `navigator.share({ files })` when available). Thin
 * wrapper over the Web Share API (platform → core only).
 */

/** True when this browser can share the file through the share sheet. */
export function canShareFile(file: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
}

/**
 * Opens the share sheet for a file.
 *
 * @param file The file to share.
 * @returns 'shared' when the sheet completed, 'dismissed' when the user
 *   closed it, 'failed' when the browser refused.
 */
export async function shareFile(file: File): Promise<'shared' | 'dismissed' | 'failed'> {
  try {
    await navigator.share({ files: [file], title: file.name });
    return 'shared';
  } catch (error) {
    return error instanceof Error && error.name === 'AbortError' ? 'dismissed' : 'failed';
  }
}

/** How long a download's object URL stays valid (the browser has started
 * reading it long before). */
const DOWNLOAD_URL_LIFETIME_MS = 60_000;

/**
 * Saves a file through the browser's download (Files on iOS).
 *
 * @param file The file to save; its name becomes the download name.
 */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, DOWNLOAD_URL_LIFETIME_MS);
}
