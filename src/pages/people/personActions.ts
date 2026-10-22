import type { Db } from '../../db/adapter';
import * as repo from '../../repo/people';
import { fileToDataUrl, urlToDataUrl } from '../../ui/imageFile';
import type { PersonActions } from './PersonSide';

// The actions shared by author and narrator pages. `run` saves, then reloads the page.
export function personActions(db: Db, kind: repo.PersonKind, id: string, run: (fn: () => Promise<unknown>) => void | Promise<void>): PersonActions {
  return {
    update: (f) => run(() => repo.updatePerson(db, kind, id, f)),
    addAlias: (n) => run(() => repo.addAlias(db, kind, id, n)), removeAlias: (a) => run(() => repo.removeAlias(db, kind, a)),
    addLink: async (label, url) => { await repo.addLink(db, kind, id, label, url); await run(async () => undefined); }, removeLink: (i) => run(() => repo.removeLink(db, kind, id, i)),
    updateLink: async (i, label, url) => { await repo.updateLink(db, kind, id, i, label, url); await run(async () => undefined); },
    setPhoto: (file) => run(async () => repo.setPhoto(db, kind, id, await fileToDataUrl(file, 900))), setPhotoUrl: async (url) => { await repo.setPhoto(db, kind, id, await urlToDataUrl(url, 900)); await run(async () => undefined); }, removePhoto: () => run(() => repo.removePhoto(db, kind, id)),
  };
}
