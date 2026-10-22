import type { CSSProperties } from 'react';

const paths = {
  dashboard: 'M3 3h7v7H3z M14 3h7v11h-7z M3 14h7v7H3z M14 18h7v3h-7z',
  projects: 'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  customers: 'M4 21V5l8-3v19 M12 8h8v13 M2 21h20 M7 7v1 M7 12v1 M7 17v1 M16 12v1 M16 17v1',
  catalog: 'm12 3 9 5-9 5-9-5 9-5z M3 8v9l9 5 9-5V8 M12 13v9 M7.5 5.5l9 5',
  materials: 'm12 3 10 5-10 5L2 8l10-5z M2 12l10 5 10-5 M2 16l10 5 10-5',
  quotations: 'M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8z M14 2v6h6 M8 12h8 M8 16h8',
  contacts: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.9',
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  arrow: 'M5 12h14 M14 7l5 5-5 5',
  refresh: 'M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 13 1l1 5 M4 12l1 5a8 8 0 0 0 13 1',
  signout: 'M9 21H4V3h5 M9 12h12 M17 8l4 4-4 4',
  calendar: 'M4 5h16v16H4z M16 3v4 M8 3v4 M4 10h16',
  cost: 'M17 5a6 6 0 0 0-4-2C5 3 5 21 13 21a6 6 0 0 0 4-2 M4 9h11 M4 14h10',
  draft: 'M12 3H4v18h16v-8 M10 14l1-4 8-8 3 3-8 8-4 1z',
  check: 'm5 12 4 4L19 6',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
