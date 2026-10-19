import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDb } from '../db/DbContext';
import { DEFAULTS, getFeatures, setFeature, type FeatureFlags, type FeatureKey } from '../repo/features';

interface Ctx { flags: FeatureFlags; set(key: FeatureKey, on: boolean): Promise<void> }
const Features = createContext<Ctx>({ flags: DEFAULTS, set: async () => undefined });
export const useFeatures = () => useContext(Features);

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const db = useDb();
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  useEffect(() => { getFeatures(db).then(setFlags, () => setFlags(DEFAULTS)); }, [db]);
  const set = useCallback(async (key: FeatureKey, on: boolean) => {
    await setFeature(db, key, on);
    setFlags((f) => ({ ...(f ?? DEFAULTS), [key]: on }));
  }, [db]);
  const value = useMemo(() => ({ flags: flags ?? DEFAULTS, set }), [flags, set]);
  return <Features.Provider value={value}>{flags ? children : null}</Features.Provider>;
}
