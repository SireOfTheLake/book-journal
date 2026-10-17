import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { BackupEnv } from './backup';

// Screens ask for a backup environment here. Tests provide a fake one; the app builds the real one on first use.
const BackupContext = createContext<BackupEnv | null>(null);
export const BackupProvider = ({ env, children }: { env: BackupEnv; children: ReactNode }) => <BackupContext.Provider value={env}>{children}</BackupContext.Provider>;

export function useBackupEnv(): () => Promise<BackupEnv> {
  const given = useContext(BackupContext);
  return useMemo(() => {
    let real: Promise<BackupEnv> | null = null;
    return () => given ? Promise.resolve(given) : (real ??= import('./tauriEnv').then((m) => m.createTauriBackupEnv()));
  }, [given]);
}
