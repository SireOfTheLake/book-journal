export function buildExtra(o: { pubkey?: string | null; sign?: boolean }): { plugins?: { updater: { pubkey: string } }; bundle?: { createUpdaterArtifacts: boolean } };
