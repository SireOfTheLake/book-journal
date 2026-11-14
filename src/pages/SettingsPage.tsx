import { useCallback, useEffect, useState } from 'react';
import { shrinkExistingCovers } from '../ui/shrinkCover';
import { useBackupEnv } from '../backup/context';
import PrintPage from './PrintPage';
import { exportWrapup } from '../backup/wrapup';
import { MONTHS } from '../domain/printPlan';
import { exportJson, lastBackupAt, lastFullBackupAt, listBackups, makeBackup, saveCopy, type BackupFile, type BackupKind } from '../backup/backup';
import { useDb } from '../db/DbContext';
import AppearanceCard from './settings/AppearanceCard';
import TagColorsCard from './settings/TagColorsCard';
import UpdatesCard from './settings/UpdatesCard';
import ListsCard from './settings/ListsCard';
import FeaturesCard from './settings/FeaturesCard';
import LayoutCard from './settings/LayoutCard';
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
  const [lastFull, setLastFull] = useState<Date | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pictures, setPictures] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [size, setSize] = useState<DataSize | null>(null);
  const [tab, setTab] = useState<'backup' | 'print' | 'appearance' | 'lists' | 'features' | 'layout' | 'sync' | 'updates'>('backup');

  const load = useCallback(async () => {
    setLast(await lastBackupAt(db));
    setLastFull(await lastFullBackupAt(db));
    dataSize(db).then(setSize, () => undefined);
    try { const env = await getEnv(); setDir(await env.backupsDir()); setFiles(await listBackups(env)); setUnavailable(null); }
    catch (e) { setUnavailable(`Backups can only be made inside the app window. (${e instanceof Error ? e.message : String(e)})`); }
  }, [db, getEnv]);
  useEffect(() => { load().catch((e) => setMessage({ ok: false, text: String(e) })); }, [load]);

  const [wrapMode, setWrapMode] = useState<'year' | 'month'>('year');
  const [wrapYear, setWrapYear] = useState(new Date().getFullYear());
  const [wrapMonth, setWrapMonth] = useState(new Date().getMonth() + 1);
  const [wrapCovers, setWrapCovers] = useState(true);

  async function run(label: string, fn: () => Promise<string | null>) {
    setBusy(label); setMessage(null);
    try { const text = await fn(); if (text) setMessage({ ok: true, text }); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    setBusy(null);
    await load().catch(() => undefined);
  }

  return (
    <section className={`settings${tab === 'print' ? ' wide' : ''}`}>
      <h1 className="pagetitle noprint">SETTINGS</h1>
      <div className="tabs noprint" role="tablist" aria-label="Settings">
        <button type="button" role="tab" id="tab-backup" aria-selected={tab === 'backup'} aria-controls="panel-backup" onClick={() => setTab('backup')}>Backup and Export</button>
        <button type="button" role="tab" id="tab-print" aria-selected={tab === 'print'} aria-controls="panel-print" onClick={() => setTab('print')}>Print and PDF</button>
        <button type="button" role="tab" id="tab-appearance" aria-selected={tab === 'appearance'} aria-controls="panel-appearance" onClick={() => setTab('appearance')}>Appearance and Themes</button>
        <button type="button" role="tab" id="tab-lists" aria-selected={tab === 'lists'} aria-controls="panel-lists" onClick={() => setTab('lists')}>Lists</button>
        <button type="button" role="tab" id="tab-features" aria-selected={tab === 'features'} aria-controls="panel-features" onClick={() => setTab('features')}>Features</button>
        <button type="button" role="tab" id="tab-layout" aria-selected={tab === 'layout'} aria-controls="panel-layout" onClick={() => setTab('layout')}>Book Log layout</button>
        <button type="button" role="tab" id="tab-sync" aria-selected={tab === 'sync'} aria-controls="panel-sync" onClick={() => setTab('sync')}>Sync</button>
        <button type="button" role="tab" id="tab-updates" aria-selected={tab === 'updates'} aria-controls="panel-updates" onClick={() => setTab('updates')}>App updates</button>
      </div>
      {tab === 'print' && <div role="tabpanel" id="panel-print" aria-labelledby="tab-print" className="tabpanel"><PrintPage /></div>}
      {tab === 'lists' && <div role="tabpanel" id="panel-lists" aria-labelledby="tab-lists" className="tabpanel"><ListsCard /></div>}
      {tab === 'features' && <div role="tabpanel" id="panel-features" aria-labelledby="tab-features" className="tabpanel"><FeaturesCard /></div>}
      {tab === 'layout' && <div role="tabpanel" id="panel-layout" aria-labelledby="tab-layout" className="tabpanel"><LayoutCard /></div>}
      {tab === 'sync' && <div role="tabpanel" id="panel-sync" aria-labelledby="tab-sync" className="tabpanel"><SyncCard /></div>}
      {tab === 'updates' && <div role="tabpanel" id="panel-updates" aria-labelledby="tab-updates" className="tabpanel"><UpdatesCard /></div>}

      {tab === 'backup' && <div role="tabpanel" id="panel-backup" aria-labelledby="tab-backup" className="tabpanel">
      <div className="bcard">
        <span className="lbl2">Full backup</span>
        <p className="muted">{lastFull ? `Your last full backup was ${lastFull.toLocaleString()}.` : 'You have not made a full backup yet.'} A full backup is one file holding everything: all your records, covers, stickers and pictures. You choose where it is saved (a USB drive or a cloud folder is best, so it survives if this computer does not). Home reminds you every 30 days.</p>
        <div className="pictools">
          <button type="button" className="btn on" disabled={busy !== null || unavailable !== null} onClick={() => run('copy', async () => { const r = await saveCopy(db, await getEnv()); return r ? `Full backup saved to ${r.path}.` : null; })}>{busy === 'copy' ? 'Saving...' : 'Full backup...'}</button>
        </div>

        <hr className="rule" />
        <span className="lbl2">Quick backup</span>
        <p className="muted">{last ? `The last backup of any kind was ${last.toLocaleString()}.` : 'No backup of any kind yet.'} A quick backup stays in this app's own folder on this computer. One is also made automatically before each import and before each upgrade.</p>
        <div className="pictools">
          <button type="button" className="btn" disabled={busy !== null || unavailable !== null} onClick={() => run('backup', async () => { const m = await makeBackup(db, await getEnv(), 'manual'); return `Backed up as ${m.name}.`; })}>{busy === 'backup' ? 'Backing up...' : 'Back up now'}</button>
        </div>

        <hr className="rule" />
        <span className="lbl2">Shrink covers</span>
        <p className="muted">Covers are only ever shown small, so large ones waste space in your journal and in the cloud. This makes the big ones smaller (the picture looks the same on screen). Sticker pictures are never touched. New covers are shrunk automatically.</p>
        <div className="pictools">
          <button type="button" className="btn" disabled={busy !== null} onClick={() => run('shrink', async () => { const r = await shrinkExistingCovers(db); return r.shrunk ? `Made ${r.shrunk} ${r.shrunk === 1 ? 'cover' : 'covers'} smaller, saving about ${(r.savedBytes / 1_048_576 * 0.75).toFixed(0)} MB.` : 'Your covers are already small.'; })}>{busy === 'shrink' ? 'Shrinking...' : 'Shrink my covers'}</button>
        </div>

        <hr className="rule" />
        <span className="lbl2">Export your data</span>
        <p className="muted">All of your records as one readable JSON file, to keep or to use in another program. This is not a backup you can restore from.</p>
        <label className="inline"><input type="checkbox" role="switch" className="toggle" checked={pictures} onChange={(e) => setPictures(e.target.checked)} /><span className="muted">Include pictures (makes the file much larger)</span></label>
        <div className="pictools">
          <button type="button" className="btn" disabled={busy !== null || unavailable !== null} onClick={() => run('export', async () => { const r = await exportJson(db, await getEnv(), { includePictures: pictures }); return r ? `Exported ${r.rows.toLocaleString()} records from ${r.tables} tables to ${r.path}${r.includesPictures ? '' : ' (without pictures)'}.` : null; })}>{busy === 'export' ? 'Exporting...' : 'Export all data (JSON)...'}</button>
        </div>

        <hr className="rule" />
        <span className="lbl2">Reading wrap-up export</span>
        <p className="muted">Everything about a month or a year of reading in one file (books, your notes and day logs, favorite passages, ratings, tags, series, challenges and cover pictures), to give to Claude for a designed wrap-up with recommendations.</p>
        <div className="pictools">
          <div className="seg" role="group" aria-label="Wrap-up period">
            <button type="button" className={wrapMode === 'year' ? 'on' : ''} aria-pressed={wrapMode === 'year'} onClick={() => setWrapMode('year')}>Whole year</button>
            <button type="button" className={wrapMode === 'month' ? 'on' : ''} aria-pressed={wrapMode === 'month'} onClick={() => setWrapMode('month')}>One month</button>
          </div>
          <input className="field num" type="number" aria-label="Wrap-up year" value={wrapYear} onChange={(e) => setWrapYear(Number(e.target.value) || wrapYear)} />
          {wrapMode === 'month' && <select aria-label="Wrap-up month" value={wrapMonth} onChange={(e) => setWrapMonth(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>}
        </div>
        <label className="inline"><input type="checkbox" role="switch" className="toggle" checked={wrapCovers} onChange={(e) => setWrapCovers(e.target.checked)} /><span className="muted">Include cover pictures (saved as a zip file)</span></label>
        <div className="pictools">
          <button type="button" className="btn" disabled={busy !== null || unavailable !== null} onClick={() => run('wrapup', async () => { const r = await exportWrapup(db, await getEnv(), { year: wrapYear, month: wrapMode === 'month' ? wrapMonth : null }, { includeCovers: wrapCovers }); return r ? `Saved ${r.books} ${r.books === 1 ? 'book' : 'books'}${r.covers ? ` and ${r.covers} ${r.covers === 1 ? 'cover' : 'covers'}` : ''} to ${r.path}.` : null; })}>{busy === 'wrapup' ? 'Preparing...' : 'Export wrap-up...'}</button>
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
