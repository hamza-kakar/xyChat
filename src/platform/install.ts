/**
 * Home Screen / standalone detection (AGENTS.md §12.10). A Home Screen web
 * app on iOS has storage separate from Safari tabs, so imports are gated on
 * this check.
 */

/** Returns true when running as an installed standalone web app. */
export function isStandalone(): boolean {
  const displayModeStandalone =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    typeof navigator !== 'undefined' && (navigator as { standalone?: boolean }).standalone === true;
  return displayModeStandalone || iosStandalone;
}

/** Returns true when the browser is iOS Safari (not necessarily installed). */
export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent;
  const isIos = ua.includes('iPad') || ua.includes('iPhone') || ua.includes('iPod');
  const isModernIpad = ua.includes('Macintosh') && navigator.maxTouchPoints > 1;
  return isIos || isModernIpad;
}
