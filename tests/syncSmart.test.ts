// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { quickAdd } from '../src/repo/bookLog';
import { syncSmart, type SyncMemory } from '../src/sync/engine';
import { IDLE_MS, isIdle, watchActivity } from '../src/sync/activity';
import { FakeCloud } from './helpers/fakeCloud';

let a: Db; let b: Db; let cloud: FakeCloud; let ma: SyncMemory; let mb: SyncMemory;
beforeEach(() => { a = migrateNodeDb(); b = migrateNodeDb(); cloud = new FakeCloud(); ma = { mark: undefined }; mb = { mark: undefined }; });
const smart = (db: Db, m: SyncMemory, force = false) => syncSmart(db, cloud.transport(), m, { force });

describe('checking for changes before a full sync', () => {
  it('the first check is a full sync, and a check when nothing changed is one request', async () => {
    expect(await smart(a, ma)).not.toBeNull(); // nothing remembered yet
    const before = cloud.requests;
    expect(await smart(a, ma)).toBeNull();
    expect(cloud.requests - before).toBe(1); // just the change mark, not a request per table
  });
  it('syncs again when another device changed something, and then goes quiet again', async () => {
    await smart(a, ma); await smart(b, mb);
    await quickAdd(b, { title: 'From B', authors: ['Bea'], status: 'tbr' });
    await smart(b, mb, true); // B sends its book
    const r = await smart(a, ma);
    expect(r?.pulled).toBeGreaterThan(0);
    const before = cloud.requests;
    expect(await smart(a, ma)).toBeNull();
    expect(cloud.requests - before).toBe(1);
    expect(await smart(b, mb)).toBeNull(); // B's own sending does not make B sync again
  });
  it('sends changes made here that are still waiting, even when the cloud has not changed', async () => {
    await smart(a, ma);
    await quickAdd(a, { title: 'Mine', authors: ['Ann'], status: 'tbr' });
    const r = await smart(a, ma);
    expect(r?.pushed).toBeGreaterThan(0);
    expect(await smart(a, ma)).toBeNull();
  });
  it('a forced sync always runs, and a cloud that cannot give a mark always runs a full sync', async () => {
    await smart(a, ma);
    expect(await smart(a, ma, true)).not.toBeNull();
    const t = cloud.transport(); delete t.changeMark;
    expect(await syncSmart(a, t, { mark: undefined })).not.toBeNull();
    const memory: SyncMemory = { mark: undefined };
    await syncSmart(a, t, memory);
    expect(await syncSmart(a, t, memory)).not.toBeNull(); // no way to tell, so it syncs
  });
});

describe('when the app counts as in the background', () => {
  const at = (over: Partial<{ hidden: boolean; focused: boolean; idleFor: number }> = {}) => isIdle({ hidden: false, focused: true, lastActivity: 0, now: over.idleFor ?? 0, ...over });
  it('is in the background when hidden, when another window has the focus, or after 10 minutes untouched', () => {
    expect(at()).toBe(false);
    expect(at({ hidden: true })).toBe(true);
    expect(at({ focused: false })).toBe(true);
    expect(at({ idleFor: IDLE_MS - 1 })).toBe(false);
    expect(at({ idleFor: IDLE_MS })).toBe(true);
  });
  it('calls onResume when the window comes back to being used, not on every movement', () => {
    let now = 0; let resumed = 0;
    const w = watchActivity(() => resumed++, window, document, () => now);
    window.dispatchEvent(new Event('focus')); // jsdom starts unfocused
    resumed = 0;
    window.dispatchEvent(new Event('pointermove')); // in use: nothing to resume
    expect(resumed).toBe(0);
    now += IDLE_MS + 1;
    expect(w.isIdle()).toBe(true);
    window.dispatchEvent(new Event('keydown'));
    expect(resumed).toBe(1);
    window.dispatchEvent(new Event('keydown'));
    expect(resumed).toBe(1);
    window.dispatchEvent(new Event('blur'));
    expect(w.isIdle()).toBe(true);
    window.dispatchEvent(new Event('focus'));
    expect(resumed).toBe(2);
    w.stop();
  });
});
