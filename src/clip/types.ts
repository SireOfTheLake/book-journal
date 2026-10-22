// What the browser extension sends the app: one book, as found on one web page.
export type ClipSite = 'goodreads' | 'storygraph' | 'audible' | 'romanceio';
export type TagHint = 'genre' | 'trope' | 'mood' | 'pace' | 'warning';
export interface ClipTag { name: string; hint?: TagHint; votes?: number }

export interface BookClip {
  v: 1;
  site: ClipSite;
  url: string;
  title: string;
  authors: string[];
  narrators?: string[];
  series?: string;
  seriesPosition?: number;
  pages?: number;
  published?: string; // 2026-02-27, or just 2026-02 / 2026
  publisher?: string;
  isbn?: string;
  asin?: string;
  format?: 'audio' | 'ebook' | 'physical';
  audioSeconds?: number;
  heat?: number; // 0 to 5
  heatLabel?: string;
  description?: string;
  cover?: string;
  tags: ClipTag[];
  authorLinks?: Record<string, string>; // an author's own page on the site, by name
}

export const SITE_NAME: Record<ClipSite, string> = { goodreads: 'Goodreads', storygraph: 'StoryGraph', audible: 'Audible', romanceio: 'Romance.io' };
