import { useEffect, useId, useState } from 'react';
import { api, type DashboardData } from '../api';
import { navigate } from '../route';
import { Icon, type IconName } from './Icon';
import '../materials.css';
import '../dashboard.css';

const monthName = (month: string): string => new Date(month + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const dateName = (date: string): string => new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const colors = ['#247f83', '#497cb2', '#c29451', '#8875ae', '#799c85', '#b87f7b'];
// The dashboard is an English analytics view, so counts, shares, quantities and money share one number style (en-GB).
const fmtNum = (value: number | null | undefined, digits = 0): string => (value === null || value === undefined ? '—' : value.toLocaleString('en-GB', { maximumFractionDigits: digits }));
const fmtMoney = (value: number | null | undefined): string => (value === null || value === undefined ? '—' : value.toLocaleString('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }));
const fmtMaterialQty = (value: number): string => fmtNum(value, Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 1 ? 2 : 4);
const compactMoney = (value: number): string => new Intl.NumberFormat('en-GB', { notation: 'compact', style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value);

export function DashboardTrend({ months, values, label, unit, money = false }: { months: string[]; values: number[]; label: string; unit?: string; money?: boolean }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const selected = hover === null ? null : Math.min(hover, values.length - 1);
  const max = Math.max(...values, 1) * 1.15;
  const x = (index: number): number => values.length === 1 ? 378 : 68 + index / Math.max(1, values.length - 1) * 620;
  const y = (value: number): number => 210 - value / max * 180;
  const path = values.map((value, index) => `${index ? 'L' : 'M'}${x(index)},${y(value)}`).join(' ');
  const ticks = [...new Set([0, Math.floor((months.length - 1) / 3), Math.floor((months.length - 1) * 2 / 3), months.length - 1])].filter((index) => index >= 0);
  const format = (value: number): string => money ? compactMoney(value) : new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  return <div className="dash-chart-wrap">
    <svg className="dash-trend" viewBox="0 0 720 250" role="img" aria-label={`${label}${unit ? ` (${unit})` : ''}`} aria-describedby={`${id}-readout`} tabIndex={0}
      onPointerMove={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); if (bounds.width && values.length) setHover(Math.max(0, Math.min(values.length - 1, Math.round(((event.clientX - bounds.left) / bounds.width * 720 - 68) / 620 * (values.length - 1))))); }}
      onPointerLeave={() => setHover(null)} onFocus={() => values.length && setHover(values.length - 1)} onBlur={() => setHover(null)}
      onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setHover((current) => Math.max(0, Math.min(values.length - 1, (current ?? values.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1)))); } }}>
      <defs><linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".2" /><stop offset="100%" stopColor="currentColor" stopOpacity=".015" /></linearGradient></defs>
      {[0, 1, 2, 3].map((tick) => <g key={tick}><line x1="68" x2="688" y1={y(max * tick / 3)} y2={y(max * tick / 3)} className="dash-grid-line" /><text x="56" y={y(max * tick / 3) + 4} textAnchor="end">{format(max * tick / 3)}</text></g>)}
      {values.length > 0 && <><path d={`${path} L${x(values.length - 1)},210 L${x(0)},210 Z`} fill={`url(#${id}-fill)`} /><path d={path} className="dash-line" />{values.map((value, index) => <circle key={index} cx={x(index)} cy={y(value)} r={selected === index ? 5 : values.length > 36 ? 2 : 3.5} className="dash-dot"><title>{monthName(months[index])}: {money ? fmtMoney(value) : `${fmtMaterialQty(value)} ${unit ?? ''}`}</title></circle>)}</>}
      {selected !== null && selected >= 0 && <line x1={x(selected)} x2={x(selected)} y1="24" y2="210" className="dash-cursor" />}
      {ticks.map((index) => <text key={index} x={x(index)} y="240" textAnchor={months.length === 1 ? 'middle' : index === 0 ? 'start' : index === months.length - 1 ? 'end' : 'middle'}>{monthName(months[index])}</text>)}
    </svg>
    <div className="dash-chart-readout" id={`${id}-readout`} aria-live="polite">{selected !== null && selected >= 0 ? <><span>{monthName(months[selected])}</span><strong>{money ? fmtMoney(values[selected]) : `${fmtMaterialQty(values[selected])} ${unit ?? ''}`}</strong></> : <span>Hover or use arrow keys to explore monthly values</span>}</div>
  </div>;
}

function QuotationActivity({ months }: { months: DashboardData['months'] }) {
  const max = Math.max(...months.map((row) => row.quotations), 3);
  const step = Math.ceil(max / 3);
  const ceiling = step * 3;
  return <svg className="dash-trend dash-activity" viewBox="0 0 720 250" role="img" aria-label="Monthly quotation activity histogram">
    {[0, 1, 2, 3].map((tick) => <g key={tick}><line x1="48" x2="700" y1={210 - tick / 3 * 175} y2={210 - tick / 3 * 175} className="dash-grid-line" /><text x="34" y={214 - tick / 3 * 175} textAnchor="end">{step * tick}</text></g>)}
    {months.map((month, index) => { const width = 652 / months.length; const active = month.active / ceiling * 175; const draft = month.draft / ceiling * 175; const barWidth = Math.min(width * .6, 42); return <g key={month.month}>
      <rect x={48 + (index + .5) * width - barWidth / 2} y={210 - active} width={barWidth} height={active} fill="#247f83" rx="2"><title>{monthName(month.month)}: {month.active} confirmed</title></rect>
      <rect x={48 + (index + .5) * width - barWidth / 2} y={210 - active - draft} width={barWidth} height={draft} fill="#dbb980" rx="2"><title>{monthName(month.month)}: {month.draft} drafts</title></rect>
      {(index === 0 || index === months.length - 1 || index === Math.floor(months.length / 2)) && <text x={48 + (index + .5) * width} y="240" textAnchor="middle">{monthName(month.month)}</text>}
    </g>; })}
  </svg>;
}

export function DashboardPage({ initialCustomerId }: { initialCustomerId?: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [range, setRange] = useState('all');
  const [customer, setCustomer] = useState(initialCustomerId ?? '');
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [productKey, setProductKey] = useState(''); const [materialId, setMaterialId] = useState('');
  useEffect(() => { setCustomer(initialCustomerId ?? ''); }, [initialCustomerId]);
  useEffect(() => {
    let live = true; setLoading(true); setError('');
    const end = new Date(); const targetMonth = end.getUTCMonth() - (range === '1m' ? 1 : range === '6m' ? 6 : 12);
    const lastDay = new Date(Date.UTC(end.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
    const start = new Date(Date.UTC(end.getUTCFullYear(), targetMonth, Math.min(end.getUTCDate(), lastDay)));
    if (range === 'custom' && (!from || !to)) { setLoading(false); return; }
    api.dashboard({ customerId: customer, status, ...(range === 'custom' ? { from, to } : range !== 'all' ? { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) } : {}) })
      .then((result) => { if (live) setData(result); }).catch((reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [range, customer, status, from, to, refresh]);
  const product = data?.products.find((row) => row.key === productKey) ?? data?.products[0];
  const material = data?.materials.find((row) => row.id === materialId) ?? data?.materials[0];
  const months = data?.months.map((month) => month.month) ?? [];
  const totalClientCost = data?.clients.reduce((sum, client) => sum + client.estimatedCost, 0) ?? 0;
  const clientsByCost = [...(data?.clients ?? [])].sort((a, b) => b.estimatedCost - a.estimatedCost);
  const leadingClient = clientsByCost[0];
  const resetFilters = (): void => { setRange('all'); setCustomer(''); setStatus('all'); setFrom(''); setTo(''); };
  const filtered = range !== 'all' || !!customer || status !== 'all';
  const ready = !loading && !error && data && (range !== 'custom' || (from && to));
  return <div className="dashboard-page">
    <header className="inventory-heading dash-heading"><div><div className="inventory-eyebrow">Your business at a glance</div><h1>Dashboard<span className="heading-dot">.</span></h1><p>Keep your customers, quotations and material demand in view.</p></div><div className="dash-header-actions"><button className="icon-button" aria-label="Refresh dashboard" title="Refresh dashboard" onClick={() => setRefresh(refresh + 1)} disabled={loading}><Icon name="refresh" size={18} /></button><button className="primary button-with-icon" onClick={() => navigate({ page: 'projects' })}>View projects <Icon name="arrow" size={16} /></button></div></header>
    <section className="dash-filters" aria-label="Dashboard filters"><label><span><Icon name="calendar" size={14} /> Period</span><select aria-label="Dashboard period" value={range} onChange={(event) => setRange(event.target.value)}><option value="all">All time</option><option value="1m">Last month</option><option value="6m">Last 6 months</option><option value="1y">Last year</option><option value="custom">Custom dates</option></select></label><label><span>Customer</span><select aria-label="Dashboard customer" value={customer} onChange={(event) => setCustomer(event.target.value)}><option value="">All customers</option>{data?.customers.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label><span>Status</span><select aria-label="Dashboard status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All quotations</option><option value="active">Confirmed only</option><option value="draft">Drafts only</option></select></label>{range === 'custom' && <><label><span>From</span><input type="date" aria-label="Dashboard start date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label><span>To</span><input type="date" aria-label="Dashboard end date" value={to} onChange={(event) => setTo(event.target.value)} /></label></>}{filtered && <button className="dash-reset" onClick={resetFilters}>Reset filters</button>}<span className="dash-filter-caption">{ready ? `${dateName(data.from)} — ${dateName(data.to)}` : 'By quotation date'}</span></section>
    {error && <div className="error-box" role="alert">{error} <button onClick={() => setRefresh(refresh + 1)}>Retry</button></div>}
    {loading && <div className="dash-loading" role="status"><div className="dash-loading-line" />Loading your dashboard…</div>}
    {!loading && range === 'custom' && (!from || !to) && <section className="dash-notice">Choose a start and end date to explore a specific period.</section>}
    {ready && <>
      <div className="dash-kpis">{([
        { label: 'Estimated quotation cost', value: compactMoney(data.totals.estimatedCost), title: fmtMoney(data.totals.estimatedCost), note: data.totals.uncostedItems ? `Partial · ${data.totals.uncostedItems} rows without a cost` : 'Combined cost of selected quotations', icon: 'cost', className: 'featured' },
        { label: 'Confirmed quotations', value: fmtNum(data.totals.active), note: `Of ${fmtNum(data.totals.quotations)} total quotations`, icon: 'check', className: 'confirmed' },
        { label: 'Draft quotations', value: fmtNum(data.totals.draft), note: data.totals.draft ? 'Ready to continue working on' : 'No drafts in this selection', icon: 'draft', className: 'drafts' },
        { label: 'Customer accounts', value: fmtNum(data.totals.customers), note: `${fmtNum(data.totals.projects)} projects with quotations`, icon: 'customers', className: 'accounts' },
      ] satisfies Array<{ label: string; value: string; title?: string; note: string; icon: IconName; className: string }>).map((card) => <section className={`dash-kpi ${card.className}`} key={card.label}><div><span>{card.label}</span><span className="dash-kpi-icon"><Icon name={card.icon} size={18} /></span></div><strong title={card.title}>{card.value}</strong><small>{card.note}</small></section>)}</div>
      {data.totals.quotations === 0 ? <section className="dash-empty"><span className="dash-empty-icon"><Icon name="quotations" size={28} /></span><h2>No quotations in this view</h2><p>Try a wider period or another customer to see their activity.</p><button onClick={resetFilters}>Show all activity <Icon name="arrow" size={16} /></button></section> : <>
        <div className="dash-overview-grid">
          <section className="dash-card dash-cost-card"><div className="dash-card-heading"><div><div className="dash-overline">Cost overview</div><h2>Estimated cost over time</h2><p>Monthly quotation costs, in EUR</p></div><span className="dash-chart-tag">Monthly</span></div><DashboardTrend months={months} values={data.months.map((month) => month.estimatedCost)} label="Monthly estimated quotation cost" money /></section>
          <section className="dash-card dash-mix-card"><div className="dash-card-heading"><div><div className="dash-overline">Quotation status</div><h2>Work in progress</h2></div><Icon name="quotations" size={20} /></div><div className="dash-donut-wrap"><svg className="dash-donut" viewBox="0 0 180 180" role="img" aria-label={`${data.totals.active} confirmed and ${data.totals.draft} draft quotations`}><circle cx="90" cy="90" r="65" fill="none" className="dash-donut-track" strokeWidth="16" /><circle cx="90" cy="90" r="65" fill="none" stroke="#dbb980" strokeWidth="16" /><circle cx="90" cy="90" r="65" fill="none" stroke="#247f83" strokeWidth="16" pathLength="100" strokeDasharray={`${data.totals.active / data.totals.quotations * 100} 100`} transform="rotate(-90 90 90)" /></svg><div className="dash-donut-value"><strong>{data.totals.quotations}</strong><span>quotations</span></div></div><div className="dash-mix-legend"><button onClick={() => setStatus('active')}><i className="legend-confirmed" />Confirmed<strong>{data.totals.active}</strong></button><button onClick={() => setStatus('draft')}><i className="legend-draft" />Drafts<strong>{data.totals.draft}</strong></button></div><button className="dash-next-action" onClick={() => navigate({ page: 'quotations', status: 'draft' })}>Open draft quotations<Icon name="arrow" size={16} /></button></section>
        </div>
        <div className="dash-chart-grid">
          <section className="dash-card"><div className="dash-card-heading"><div><div className="dash-overline">Customer relationships</div><h2>Customer portfolio</h2><p>Share of estimated quotation cost</p></div><button className="dash-text-action" aria-label="View all customers" onClick={() => navigate({ page: 'customers' })}><Icon name="arrow" size={18} /></button></div><div className="dash-client-list">{clientsByCost.map((client, index) => { const share = totalClientCost ? client.estimatedCost / totalClientCost * 100 : 0; return <div className="dash-client-row" key={client.id}><button className="dash-client-name" onClick={() => navigate({ page: 'customers', id: client.id })}><span className={`customer-avatar customer-tone-${index % 3}`}>{client.name.slice(0, 2)}</span><span><strong>{client.name}</strong><small>{client.projects} projects · {client.quotations} quotations</small></span></button><div className="dash-client-cost"><strong>{compactMoney(client.estimatedCost)}</strong><span>{fmtNum(share, 1)}%</span><div className="dash-share-track"><i style={{ width: `${share}%`, background: colors[index % colors.length] }} /></div></div><button className="dash-client-filter" aria-label={`Filter dashboard to ${client.name}`} title={`Focus on ${client.name}`} onClick={() => setCustomer(client.id)}><Icon name="arrow" size={16} /></button></div>; })}</div>{leadingClient && totalClientCost > 0 && <p className="dash-card-note"><strong>{leadingClient.name}</strong> accounts for {fmtNum(leadingClient.estimatedCost / totalClientCost * 100, 1)}% of the selected quotation cost.</p>}</section>
          <section className="dash-card"><div className="dash-card-heading"><div><div className="dash-overline">Activity</div><h2>Quotations over time</h2><p>Volume by quotation date</p></div><div className="dash-legend"><span><i className="legend-confirmed" />Confirmed</span><span><i className="legend-draft" />Draft</span></div></div><QuotationActivity months={data.months} /><div className="dash-activity-footer"><span><strong>{data.totals.quotations}</strong> quotations in this selection</span><button className="dash-text-action" onClick={() => navigate({ page: 'quotations', status: 'all' })}>View all <Icon name="arrow" size={15} /></button></div></section>
        </div>
        <div className="dash-section-heading"><div><h2>What your projects need</h2><p>Explore quoted product quantities and the materials behind them.</p></div><span>{data.totals.products} product / unit combinations · {data.totals.materials} materials</span></div>
        <div className="dash-chart-grid">
          <section className="dash-card dash-usage-card"><div className="dash-card-heading"><div><span className="dash-card-icon"><Icon name="catalog" size={18} /></span><h2>Product demand</h2><p>Quoted quantities over time</p></div><button className="dash-text-action" onClick={() => navigate({ page: 'catalog' })}>Catalog <Icon name="arrow" size={15} /></button></div><select aria-label="Product usage chart" value={product?.key ?? ''} onChange={(event) => setProductKey(event.target.value)} disabled={!data.products.length}>{!data.products.length && <option>No quoted products</option>}{data.products.map((row) => <option key={row.key} value={row.key}>{row.name} ({row.unit})</option>)}</select>{product && <><div className="dash-selected-value"><strong>{fmtMaterialQty(product.quantity)} <small>{product.unit}</small></strong><span>in {product.quotations} quotations</span></div><DashboardTrend months={months} values={product.trend} label={`${product.name} quoted quantities`} unit={product.unit} /><div className="dash-usage-link">{product.id && <button onClick={() => navigate({ page: 'product', id: product.id! })}>View selected product <Icon name="arrow" size={14} /></button>}</div><div className="dash-rank-heading"><span>Most frequently quoted</span><span>Quotations</span></div><div className="dash-rank-list">{data.products.slice(0, 4).map((row, index) => <button key={row.key} className={row.key === product.key ? 'selected' : ''} aria-pressed={row.key === product.key} onClick={() => setProductKey(row.key)}><span className="dash-rank-number">0{index + 1}</span><span className="dash-rank-name">{row.name}<small>{fmtMaterialQty(row.quantity)} {row.unit}</small></span><strong>{row.quotations}</strong></button>)}</div></>}{!product && <p className="dash-card-note">There are no product quantities in this selection.</p>}</section>
          <section className="dash-card dash-usage-card material-demand"><div className="dash-card-heading"><div><span className="dash-card-icon"><Icon name="materials" size={18} /></span><h2>Material demand</h2><p>From product bills of materials</p></div><button className="dash-text-action" onClick={() => navigate({ page: 'materials' })}>Materials <Icon name="arrow" size={15} /></button></div><select aria-label="Material demand chart" value={material?.id ?? ''} onChange={(event) => setMaterialId(event.target.value)} disabled={!data.materials.length}>{!data.materials.length && <option>No linked materials</option>}{data.materials.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.unit})</option>)}</select>{material && <><div className="dash-selected-value"><strong>{fmtMaterialQty(material.quantity)} <small>{material.unit}</small></strong><span>across {material.products} products</span></div><DashboardTrend months={months} values={material.trend} label={`${material.name} material demand`} unit={material.unit} /><div className="dash-usage-link"><button onClick={() => navigate({ page: 'materials', id: material.id })}>View material & price history <Icon name="arrow" size={14} /></button></div><div className="dash-rank-heading"><span>Used across quoted products</span><span>Products</span></div><div className="dash-rank-list">{[...data.materials].sort((a, b) => b.products - a.products).slice(0, 4).map((row, index) => <button key={row.id} className={row.id === material.id ? 'selected' : ''} aria-pressed={row.id === material.id} onClick={() => setMaterialId(row.id)}><span className="dash-rank-number">0{index + 1}</span><span className="dash-rank-name">{row.name}<small>{fmtMaterialQty(row.quantity)} {row.unit}{row.mockQuantity > 0 ? ' · includes estimated quantities' : ''}</small></span><strong>{row.products}</strong></button>)}</div>{material.mockQuantity > 0 && <p className="dash-card-note">{fmtMaterialQty(material.mockQuantity)} {material.unit} of this demand uses estimated BOM quantities.</p>}</>}{!material && <p className="dash-card-note">No linked material quantities in this selection.</p>}</section>
        </div>
      </>}
      {data.totals.uncostedItems > 0 && <div className="dash-notice dash-data-notice"><strong>Partial totals</strong><span>{data.totals.uncostedItems} rows have no cost yet, so totals are partial.</span></div>}
      {(data.totals.unmappedLines > 0 || data.totals.incompatibleLines > 0) && <p className="dash-footnote">Material demand covers quotation lines with a bill of materials{data.totals.unmappedLines > 0 ? `; ${data.totals.unmappedLines} lines have none yet` : ''}{data.totals.incompatibleLines > 0 ? `${data.totals.unmappedLines > 0 ? ' and' : ';'} ${data.totals.incompatibleLines} use units that cannot be converted` : ''}.</p>}
    </>}
  </div>;
}
