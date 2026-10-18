// Small line icons for the sidebar. They are decoration only, so they are hidden from screen readers (the link text names the page).
const PATHS = {
  home: ['M3 11l9-8 9 8', 'M5 10v10h14V10'],
  books: ['M4 4h4v16H4z', 'M10 4h4v16h-4z', 'M16.5 6l3.5 1-3 13-3.5-1z'],
  shelf: ['M4 20h16', 'M6 20V9h4v11', 'M12 20V5h4v15'],
  releases: ['M6 16v-5a6 6 0 0112 0v5l2 2H4z', 'M10 21h4'],
  series: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5'],
  authors: ['M4 20l1-4L16 5l3 3L8 19z', 'M14 7l3 3'],
  narrators: ['M12 3a3 3 0 013 3v5a3 3 0 01-6 0V6a3 3 0 013-3z', 'M6 11a6 6 0 0012 0', 'M12 17v4'],
  characters: ['M12 12a4 4 0 100-8 4 4 0 000 8z', 'M4 21a8 8 0 0116 0'],
  pin: ['M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z', 'M12 12.2a2.2 2.2 0 100-4.4 2.2 2.2 0 000 4.4z'],
  quote: ['M5 6h6v6H8c0 2 1 3 3 3', 'M13 6h6v6h-3c0 2 1 3 3 3'],
  universes: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M3 12h18', 'M12 3c3 3 3 15 0 18', 'M12 3c-3 3-3 15 0 18'],
  overview: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 8a4 4 0 100 8 4 4 0 000-8z'],
  list: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  bracket: ['M4 5h5v5H4', 'M4 14h5v5H4', 'M9 7.5h4v9H9', 'M13 12h7'],
  dashboard: ['M5 20V10', 'M12 20V4', 'M19 20v-7'],
  challenges: ['M7 4h10v5a5 5 0 01-10 0z', 'M7 6H4v2a3 3 0 003 3', 'M17 6h3v2a3 3 0 01-3 3', 'M12 14v4', 'M8 20h8'],
  dice: ['M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z', 'M8 8h.01', 'M16 8h.01', 'M12 12h.01', 'M8 16h.01', 'M16 16h.01'],
  sparkle: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z'],
  import: ['M12 4v11', 'M7 11l5 5 5-5', 'M5 20h14'],
  settings: ['M4 7h10', 'M18 7h2', 'M4 17h2', 'M10 17h10', 'M14 5v4', 'M6 15v4'],
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
