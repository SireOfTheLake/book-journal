// Runs inside the book page (injected by the popup). Reads the book and leaves it for the popup to pick up.
import { extractClip } from '../../src/clip/extract';

(window as unknown as { __bookJournalClip?: unknown }).__bookJournalClip = extractClip(document, location.href);
