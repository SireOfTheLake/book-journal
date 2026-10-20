import { describe, expect, it } from 'vitest';
import { makeSetupCode, readSetupCode } from '../src/sync/setupCode';
import { pendingChanges } from '../src/sync/pending';
import { migrateNodeDb } from '../src/db/nodeDb';
import { quickAdd } from '../src/repo/bookLog';
import { syncOnce } from '../src/sync/engine';
import { FakeCloud } from './helpers/fakeCloud';

describe('phone setup code', () => {
  const cfg = { url: 'https://abcd.supabase.co', anonKey: 'eyJhbGciOi.payload_-x.sig' };
  it('round-trips the address and key', () => {
    const code = makeSetupCode(cfg);
    expect(code.startsWith('bj1.')).toBe(true);
    expect(readSetupCode(code)).toEqual(cfg);
    expect(readSetupCode(`  ${code.slice(0, 10)}\n${code.slice(10)} `)).toEqual(cfg); // pasted with stray spaces or a line break
  });
  it('explains what is wrong with a bad code', () => {
    expect(() => readSetupCode('hello')).toThrow(/not a setup code/);
    expect(() => readSetupCode('bj1.!!!')).toThrow(/damaged/);
  });
});

describe('changes waiting to be sent', () => {
  it('counts edits not yet sent and drops to zero after a sync', async () => {
    const db = migrateNodeDb();
    const cloud = new FakeCloud();
    await syncOnce(db, cloud.transport());
    expect(await pendingChanges(db)).toBe(0);
    await quickAdd(db, { title: 'Waiting', authors: ['Ann'], status: 'tbr' });
    expect(await pendingChanges(db)).toBeGreaterThan(0);
    await syncOnce(db, cloud.transport());
    expect(await pendingChanges(db)).toBe(0);
  });
});
