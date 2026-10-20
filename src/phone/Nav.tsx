import { NavLink, useLocation } from 'react-router-dom';

const icon = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export default function Nav() {
  const { pathname } = useLocation();
  const cur = (p: string) => (p === '/' ? pathname === '/' || pathname.startsWith('/book') || pathname.startsWith('/search') : pathname.startsWith(p)) ? 'cur' : '';
  return (
    <nav className="ph-nav" aria-label="Main">
      <NavLink to="/" className={cur('/')}><svg {...icon} aria-hidden="true"><path d="M4 4h4v16H4zM10 4h4v16h-4zM16.5 6l3.5 1-3 13-3.5-1z" /></svg>Find</NavLink>
      <NavLink to="/add" className={cur('/add')}><span className="plus"><svg {...icon} width={20} height={20} strokeWidth={2.5} stroke="#1c1714" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></span>Add</NavLink>
      <NavLink to="/people" className={cur('/people') || (pathname.startsWith('/character') ? 'cur' : '')}><svg {...icon} aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></svg>People</NavLink>
      <NavLink to="/sync" className={cur('/sync')}><svg {...icon} aria-hidden="true"><path d="M20 11a8 8 0 00-14-4M4 4v4h4M4 13a8 8 0 0014 4M20 20v-4h-4" /></svg>Sync</NavLink>
    </nav>
  );
}
