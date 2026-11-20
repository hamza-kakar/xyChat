import { isStandalone } from '../../../platform/install';

/** Install-gate state (§12.8.1): separate from the component so the file
 * keeps a single component export (react-refresh). */

/** Module-level bypass hint ("continue anyway" chosen). Deliberately not
 * persisted: the gate re-arms every session — conservative, and no web
 * storage is used for it (§15.4). */
let bypassed = false;

/** True when the gate can be skipped: standalone, or the user chose the
 * explicit bypass this session. Calling with `true` records the bypass. */
export function installGateDone(bypass = false): boolean {
  if (bypass) {
    bypassed = true;
  }
  return isStandalone() || bypassed;
}
