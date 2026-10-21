import { useEffect, useState } from 'react';

export type Route =
  | { page: 'catalog' }
  | { page: 'product'; id: string }
  | { page: 'quotations' }
  | { page: 'quotation'; id: string; tab: string }
  | { page: 'new'; id?: string; step: number };

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  if (parts[0] === 'quotations' && parts[1]) return { page: 'quotation', id: parts[1], tab: params.get('tab') ?? 'elenco' };
  if (parts[0] === 'quotations') return { page: 'quotations' };
  if (parts[0] === 'product' && parts[1]) return { page: 'product', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'new') return { page: 'new', id: parts[1], step: parts[2] ? Number(parts[2]) : 1 };
  return { page: 'catalog' };
}

export function toHash(r: Route): string {
  switch (r.page) {
    case 'catalog':
      return '#/catalog';
    case 'product':
      return `#/product/${encodeURIComponent(r.id)}`;
    case 'quotations':
      return '#/quotations';
    case 'quotation':
      return `#/quotations/${encodeURIComponent(r.id)}${r.tab && r.tab !== 'elenco' ? `?tab=${r.tab}` : ''}`;
    case 'new':
      return r.id ? `#/new/${encodeURIComponent(r.id)}/${r.step}` : '#/new';
  }
}

export function navigate(r: Route): void {
  window.location.hash = toHash(r);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
