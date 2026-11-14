import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { syncOnce } from '../src/sync/engine';
import { newId } from '../src/domain/ids';
import { FakeCloud } from './helpers/fakeCloud';

let a: Db; let b: Db; let cloud: FakeCloud;
beforeEach(() => { a = migrateNodeDb(); b = migrateNodeDb(); cloud = new FakeCloud(); });
const BIG = `data:image/png;base64,${'A'.repeat(5000)}`;
const COVER = `data:image/jpeg;base64,${'B'.repeat(500)}`;

async function addImage(db: Db, data: string) { const id = newId(); await db.execute('INSERT INTO image (id, file_path, mime_type) VALUES (?, ?, ?)', [id, data, 'image/png']); return id; }
const cloudPath = (id: string) => (cloud.tables.get('image')?.get(id)?.file_path ?? undefined);

describe('sticker pictures stay on this computer', () => {
  it('sends a cover with its picture but a sticker without it, and the sticker keeps its picture here', async () => {
    const cover = await addImage(a, COVER);
    const sticker = await addImage(a, BIG);
    await markSticker(a, sticker);
    await syncOnce(a, cloud.transport());
    expect(cloudPath(cover)).toBe(COVER);
    expect(cloudPath(sticker)).toBe('');
    const [local] = await a.select<{ file_path: string }>('SELECT file_path FROM image WHERE id = ?', [sticker]);
    expect(local.file_path).toBe(BIG);
  });
  it('another device gets the sticker row empty, and never blanks a picture it already has', async () => {
    const sticker = await addImage(a, BIG);
    await markSticker(a, sticker);
    await syncOnce(a, cloud.transport());
    await syncOnce(b, cloud.transport());
    const [seen] = await b.select<{ file_path: string }>('SELECT file_path FROM image WHERE id = ?', [sticker]);
    expect(seen.file_path).toBe('');
    // B has the real picture (say it was copied over), then a newer empty row arrives from the cloud
    await b.execute('UPDATE image SET file_path = ? WHERE id = ?', [BIG, sticker]);
    const t = cloud.tables.get('image')!.get(sticker)!;
    t.updated_at = '2999-01-01T00:00:00.000Z'; t._seq = 99999;
    await syncOnce(b, cloud.transport());
    const [kept] = await b.select<{ file_path: string }>('SELECT file_path FROM image WHERE id = ?', [sticker]);
    expect(kept.file_path).toBe(BIG);
  });
  it('replaces a big sticker already in the cloud, once', async () => {
    const sticker = await addImage(a, BIG);
    await markSticker(a, sticker);
    // the cloud holds the big copy from before this change
    cloud.tables.set('image', new Map([[sticker, { id: sticker, file_path: BIG, updated_at: '2020-01-01T00:00:00.000Z', _seq: 1 } as never]]));
    const [row] = await a.select<{ updated_at: string }>('SELECT updated_at FROM image WHERE id = ?', [sticker]);
    await a.execute("INSERT INTO app_setting (key, value) VALUES ('sync_push:image', ?)", [row.updated_at]); // already sent the old way
    await new Promise((r) => setTimeout(r, 5));
    await syncOnce(a, cloud.transport());
    expect(cloudPath(sticker)).toBe('');
    const pushed = cloud.pushes;
    await syncOnce(a, cloud.transport());
    expect(cloud.pushes).toBe(pushed); // not again
  });
});

// Makes a Bingo prompt that uses the picture, so it counts as sticker art.
async function markSticker(db: Db, imageId: string) {
  const bankId = newId();
  await db.execute('INSERT INTO bingo_bank (id, name) VALUES (?, ?)', [bankId, 'Bank']);
  await db.execute('INSERT INTO bingo_prompt (id, bank_id, text, image_id, position) VALUES (?, ?, ?, ?, 1)', [newId(), bankId, 'A prompt', imageId]);
}
