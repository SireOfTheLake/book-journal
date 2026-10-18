import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDb } from '../db/DbContext';
import { ALL_ON, getFeatures, setFeature, type FeatureFlags, type FeatureKey } from '../repo/features';

interface Ctx { flags: FeatureFlags; set(key: FeatureKey, on: boolean): Promise<void> }
const Features = createContext<Ctx>({ flags: ALL_ON, set: async () => undefined });
export const useFeatures = () => useContext(Features);

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const db = useDb();
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  useEffect(() => { getFeatures(db).then(setFlags, () => setFlags(ALL_ON)); }, [db]);
  const set = useCallback(async (key: FeatureKey, on: boolean) => {
    await setFeature(db, key, on);
    setFlags((f) => ({ ...(f ?? ALL_ON), [key]: on }));
  }, [db]);
  const value = useMemo(() => ({ flags: flags ?? ALL_ON, set }), [flags, set]);
  return <Features.Provider value={value}>{flags ? children : null}</Features.Provider>;
}
