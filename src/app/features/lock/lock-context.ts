/**
 * Lets Settings lock the app on demand ("Lock now").
 */
import { createContext, useContext } from 'react';

/** What the lock gate offers to the screens inside it. */
export interface LockActions {
  readonly lockNow: () => void;
}

export const LockContext = createContext<LockActions>({ lockNow: () => undefined });

/** The lock gate's actions. */
export function useLockActions(): LockActions {
  return useContext(LockContext);
}
