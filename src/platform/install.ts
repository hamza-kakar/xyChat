/**
 * Install detection: the app must run standalone
 * (Home Screen) for imports — Safari-tab storage is separate and can be
 * evicted. Pure platform wrapper (platform → core only).
 */

/** True when running as an installed standalone app (iOS Home Screen or
 * desktop install). */
export function isStandalone(): boolean {
  const standaloneQuery =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    'standalone' in window.navigator &&
    (window.navigator as { readonly standalone?: boolean }).standalone === true;
  return standaloneQuery || iosStandalone;
}

/** True when the engine reports iOS Safari (guides install instructions). */
export function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const isIosDevice = ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod');
  const usesWebkit = ua.includes('Safari') && !ua.includes('Chrome');
  return isIosDevice && usesWebkit;
}
