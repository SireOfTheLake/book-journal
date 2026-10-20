import { useCallback, useEffect, useState } from 'react';
import { useBackupEnv } from '../backup/context';
import { exportJson, lastBackupAt, listBackups, makeBackup, saveCopy, type BackupFile, type BackupKind } from '../backup/backup';
import { useDb } from '../db/DbContext';
import AppearanceCard from './settings/AppearanceCard';
import TagColorsCard from './settings/TagColorsCard';
import UpdatesCard from './settings/UpdatesCard';
import ListsCard from './settings/ListsCard';
import FeaturesCard from './settings/FeaturesCard';
import SyncCard from './settings/SyncCard';
import { dataSize, megabytes, type DataSize } from '../sync/size';

const KIND_LABEL: Record<BackupKind, string> = { manual: 'Backed up by you', 'before-import': 'Before an import', 'before-upgrade': 'Before an upgrade' };
const parentOf = (dir: string) => dir.replace(/[\\/][^\\/]*[\\/]?$/, '');

export default function SettingsPage() {
  const db = useDb();
  const getEnv = useBackupEnv();
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [dir, setDir] = useState<string | null>(null);
  const [last, setLast] = useState<Date | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pictures, setPictures] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [size, setSize] = useState<DataSize | null>(null);
  const [tab, setTab] = useState<'backup' | 'appearance' | 'lists' | 'features' | 'sync' | 'updates'>('backup');

  const load = useCallback(async () => {
    setLast(await lastBackupAt(db));
    dataSize(db).then(setSize, () => undefined);
    try { const env = await getEnv(); setDir(await env.backupsDir()); setFiles(await listBackups(env)); setUnavailable(null); }
    catch (e) { setUnavailable(`Backups can only be made inside the app window. (${e instanceof Error ? e.message : String(e)})`); }
  }, [db, getEnv]);
  useEffect(() => { load().catch((e) => setMessage({ ok: false, text: String(e) })); }, [load]);

  async function run(label: string, fn: () => Promise<string | null>) {
    setBusy(label); setMessage(null);
    try { const text = await fn(); if (text) setMessage({ ok: true, text }); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    setBusy(null);
    await load().catch(() => undefined);
  }

  return (
    <section className="settings">
      <h1 className="pagetitle">SETTINGS</h1>
      <div className="tabs" role="tablist" aria-label="Settings">
        <button type="button" role="tab" id="tab-backup" aria-selected={tab === 'backup'} aria-controls="panel-backup" onClick={() => setTab('backup')}>Backup and Export</button>
        <button type="button" role="tab" id="tab-appearance" aria-selected={tab === 'appearance'} aria-controls="panel-appearance" onClick={() => setTab('appearance')}>Appearance and Themes</button>
        <button type="button" role="tab" id="tab-lists" aria-selected={tab === 'lists'} aria-controls="panel-lists" onClick={() => setTab('lists')}>Lists</button>
        <button type="button" role="tab" id="tab-features" aria-selected={tab === 'features'} aria-controls="panel-features" onClick={() => setTab('features')}>Features</button>
        <button type="button" role="tab" id="tab-sync" aria-selected={tab === 'sync'} aria-controls="panel-sync" onClick={() => setTab('sync')}>Sync</button>
        <button type="button" role="tab" id="tab-updates" aria-selected={tab === 'updates'} aria-controls="panel-updates" onClick={() => setTab('updates')}>App updates</button>
      </div>
      {tab === 'lists' && <div role="tabpanel" id="panel-lists" aria-labelledby="tab-lists" className="tabpanel"><ListsCard /></div>}
      {tab === 'features' && <div role="tabpanel" id="panel-features" aria-labelledby="tab-features" className="tabpanel"><FeaturesCard /></div>}
      {tab === 'sync' && <div role="tabpanel" id="panel-sync" aria-labelledby="tab-sync" className="tabpanel"><SyncCard /></div>}
      {tab === 'updates' && <div role="tabpanel" id="panel-updates" aria-labelledby="tab-updates" className="tabpanel"><UpdatesCard /></div>}

      {tab === 'backup' && <div role="tabpanel" id="panel-backup" aria-labelledby="tab-backup" className="tabpanel">
      <div className="bcard">
        <span className="lbl2">Backup and export</span>
        <p className="muted">{last ? `Your last backup was ${last.toLocaleString()}.` : 'You have not made a backup yet.'} A backup is a complete copy of your journal, including every picture. A copy is also made automatically before each import and before each upgrade.</p>
        <div className="pictools">
          <button type="button" className="btn on" disabled={busy !== null || unavailable !== null} onClick={() => run('backup', async () => { const m = await makeBackup(db, await getEnv(), 'manual'); return `Backed up as ${m.name}.`; })}>{busy === 'backup' ? 'Backing up...' : 'Back up now'}</button>
          <button type="button" className="btn" disabled={busy !== null || unavailable !== null} onClick={() => run('copy', async () => { const r = await saveCopy(db, await getEnv()); return r ? `A copy was saved to ${r.path}.` : null; })}>{busy === 'copy' ? 'Saving...' : 'Save a copy somewhere else...'}</button>
        </div>
        <span className="muted small">"Save a copy somewhere else" is for a USB drive or a cloud folder, so a backup survives if this computer does not.</span>

        <hr className="rule" />
        <span className="lbl2">Export your data</span>
        <p className="muted">All of your records as one readable JSON file, to keep or to use in another program. This is not a backup you can restore from.</p>
        <label className="inline"><input type="checkbox" checked={pictures} onChange={(e) => setPictures(e.target.checked)} /><span className="muted">Include pictures (makes the file much larger)</span></label>
        <div className="pictools">
          <button type="button" className="btn" disabled={busy !== null || unavailable !== null} onClick={() => run('export', async () => { const r = await exportJson(db, await getEnv(), { includePictures: pictures }); return r ? `Exported ${r.rows.toLocaleString()} records from ${r.tables} tables to ${r.path}${r.includesPictures ? '' : ' (without pictures)'}.` : null; })}>{busy === 'export' ? 'Exporting...' : 'Export all data (JSON)...'}</button>
        </div>
        {message && <div className={message.ok ? 'notice' : 'muted'} role={message.ok ? 'status' : 'alert'}>{message.text}</div>}
        {unavailable && <div className="muted" role="alert">{unavailable}</div>}
      </div>

      {size && (
        <div className="bcard">
          <span className="lbl2">How big your journal is</span>
          <p className="muted">{`${size.pictures} ${size.pictures === 1 ? 'picture' : 'pictures'} take about ${megabytes(size.pictureBytes)} MB. Everything else (books, characters, notes and the rest) takes about ${megabytes(size.textBytes)} MB.`}</p>
          <span className="muted small">This matters for syncing to another device: pictures are the heavy part, so they will travel separately from the text.</span>
        </div>
      )}

      <div className="bcard">
        <span className="lbl2">Your backups</span>
        {dir && <span className="muted small">{`Kept in ${dir}. The newest 20 automatic backups are kept; ones you make yourself are never removed.`}</span>}
        {files.length === 0 ? <p className="muted">No backups yet.</p> : (
          <div className="ltable">
            <div className="brow2 bhead"><span>When</span><span>Kind</span><span>File</span></div>
            {files.map((f) => <div className="brow2" key={f.name}><span>{f.at.toLocaleString()}</span><span className="muted">{KIND_LABEL[f.kind]}</span><span className="muted small">{f.name}</span></div>)}
          </div>
        )}
        {dir && <p className="muted small">{`To restore a backup: close Book Journal, make a copy of book-journal.db in ${parentOf(dir)} to be safe, then copy the backup file there and rename it book-journal.db. Start the app again.`}</p>}
      </div>

      </div>}

      {tab === 'appearance' && <div role="tabpanel" id="panel-appearance" aria-labelledby="tab-appearance" className="tabpanel">
        <AppearanceCard />
        <TagColorsCard />
      </div>}
    </section>
  );
}
