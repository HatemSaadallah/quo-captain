import { useEffect, useState } from 'react';

export type Route =
  | { page: 'dashboard'; customerId?: string }
  | { page: 'catalog'; q?: string; create?: boolean }
  | { page: 'product'; id: string }
  | { page: 'quotations'; status?: string }
  | { page: 'projects'; id?: string }
  | { page: 'customers'; id?: string }
  | { page: 'materials'; id?: string }
  | { page: 'contacts' }
  | { page: 'insights'; q?: string }
  | { page: 'import' }
  | { page: 'quotation'; id: string; tab: string }
  | { page: 'new'; id?: string; step: number };

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  if (parts[0] === 'dashboard') return { page: 'dashboard', customerId: params.get('customerId') ?? undefined };
  if (parts[0] === 'quotations' && parts[1]) return { page: 'quotation', id: parts[1], tab: params.get('tab') === 'workbook' ? 'workbook' : 'elenco' };
  if (parts[0] === 'quotations') return { page: 'quotations', status: params.get('status') ?? undefined };
  if (parts[0] === 'contacts') return { page: 'contacts' };
  if (parts[0] === 'import') return { page: 'import' };
  if (parts[0] === 'insights') return { page: 'insights', q: params.get('q') ?? undefined };
  if (parts[0] === 'projects') return { page: 'projects', id: parts[1] ? decodeURIComponent(parts[1]) : undefined };
  if (parts[0] === 'customers') return { page: 'customers', id: parts[1] };
  if (parts[0] === 'materials') return { page: 'materials', id: parts[1] ? decodeURIComponent(parts[1]) : undefined };
  if (parts[0] === 'product' && parts[1]) return { page: 'product', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'new') return { page: 'new', id: parts[1], step: parts[2] ? Number(parts[2]) : 1 };
  if (parts[0] === 'catalog') return { page: 'catalog', q: params.get('q') ?? undefined, create: params.get('create') === '1' };
  return { page: 'dashboard' };
}

export function toHash(r: Route): string {
  switch (r.page) {
    case 'dashboard':
      return r.customerId ? `#/dashboard?customerId=${encodeURIComponent(r.customerId)}` : '#/dashboard';
    case 'catalog':
      return r.q || r.create ? `#/catalog${r.q ? `?q=${encodeURIComponent(r.q)}${r.create ? '&create=1' : ''}` : '?create=1'}` : '#/catalog';
    case 'product':
      return `#/product/${encodeURIComponent(r.id)}`;
    case 'quotations':
      return r.status ? `#/quotations?status=${r.status}` : '#/quotations';
    case 'contacts':
      return '#/contacts';
    case 'import':
      return '#/import';
    case 'insights':
      return r.q ? `#/insights?q=${encodeURIComponent(r.q)}` : '#/insights';
    case 'projects':
      return r.id ? `#/projects/${encodeURIComponent(r.id)}` : '#/projects';
    case 'customers':
      return r.id ? `#/customers/${encodeURIComponent(r.id)}` : '#/customers';
    case 'materials':
      return r.id ? `#/materials/${encodeURIComponent(r.id)}` : '#/materials';
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
