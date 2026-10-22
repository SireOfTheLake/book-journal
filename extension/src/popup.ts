import { encodeClip } from '../../src/clip/link';
import { SITE_NAME, type BookClip } from '../../src/clip/types';
import { siteOf } from '../../src/clip/extract';

declare const chrome: any; // eslint-disable-line @typescript-eslint/no-explicit-any

const app = document.getElementById('app')!;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...kids: (Node | string)[]) => {
  const e = document.createElement(tag);
  const { class: cls, ...rest } = props as Record<string, unknown>;
  if (cls) e.className = String(cls);
  Object.assign(e, rest);
  e.append(...kids);
  return e;
};
const say = (text: string, cls = 'muted') => { app.replaceChildren(el('h1', {}, 'ADD TO BOOK JOURNAL'), el('p', { class: cls }, text)); };

function duration(s: number) { const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60); return `${h} h ${m} min`; }

function show(clip: BookClip) {
  const facts = [
    clip.authors.join(', '),
    clip.series ? `${clip.series}${clip.seriesPosition !== undefined ? ` #${clip.seriesPosition}` : ''}` : '',
    clip.pages ? `${clip.pages} pages` : '', clip.audioSeconds ? duration(clip.audioSeconds) : '',
    clip.heat !== undefined ? `Heat ${clip.heat}/5` : '', clip.tags.length ? `${clip.tags.length} tags` : '',
    clip.narrators?.length ? `Narrated by ${clip.narrators.join(', ')}` : '',
  ].filter(Boolean);
  const img = el('img', { alt: '' });
  if (clip.cover) img.src = clip.cover; else img.style.visibility = 'hidden';
  const status = el('p', { class: 'note' }, `Found on ${SITE_NAME[clip.site]}. Book Journal opens with the details filled in for you to check.`);
  const go = el('button', { class: 'go', type: 'button' }, 'Add to Book Journal');
  go.onclick = () => {
    const a = el('a', { href: encodeClip(clip) });
    document.body.append(a); a.click(); a.remove();
    status.textContent = 'Opening Book Journal... If Chrome asks, choose Open (tick "always allow" to skip the question next time).';
  };
  const copy = el('button', { type: 'button' }, 'Copy what was found');
  copy.onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify(clip, null, 2)); copy.textContent = 'Copied'; } catch { copy.textContent = 'Could not copy'; } };
  app.replaceChildren(
    el('h1', {}, 'ADD TO BOOK JOURNAL'),
    el('div', { class: 'card' }, img, el('div', {}, el('div', { class: 't' }, clip.title), el('div', { class: 'facts' }, facts.join(' · ')))),
    el('div', { class: 'row' }, go, copy), status,
  );
}

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return say('Open a book page first.');
  if (!siteOf(tab.url)) return say('Open a book page on Goodreads, StoryGraph, Audible or Romance.io, then click this button again.');
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['page.js'] });
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => (window as unknown as { __bookJournalClip?: unknown }).__bookJournalClip ?? null });
    const clip = res?.result as BookClip | null;
    if (!clip) return say('This page loaded, but I could not find a book on it. Try again once the page has finished loading.', 'err');
    show(clip);
  } catch (e) {
    say(`Could not read this page: ${e instanceof Error ? e.message : String(e)}`, 'err');
  }
}
void main();
