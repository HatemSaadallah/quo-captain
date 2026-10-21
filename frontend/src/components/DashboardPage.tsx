import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtNum, fmtMaterialQty, type DashboardData } from '../api';
import { navigate } from '../route';
import '../materials.css';
import '../dashboard.css';

const monthName = (month: string): string => new Date(month + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const colors = ['#387aa9', '#77a7c7', '#dfaa55', '#77a995', '#8f87b5', '#c38d85'];

export function DashboardTrend({ months, values, label, unit, money = false }: { months: string[]; values: number[]; label: string; unit?: string; money?: boolean }) {
  const max = Math.max(...values, 1) * 1.15;
  const x = (index: number): number => 68 + index / Math.max(1, values.length - 1) * 620;
  const y = (value: number): number => 210 - value / max * 180;
  const path = values.map((value, index) => `${index ? 'L' : 'M'}${x(index)},${y(value)}`).join(' ');
  const ticks = [...new Set([0, Math.floor((months.length - 1) / 2), months.length - 1])].filter((index) => index >= 0);
  const format = (value: number): string => money ? new Intl.NumberFormat('en-GB', { notation: 'compact', style: 'currency', currency: 'EUR', maximumFractionDigits: 1 }).format(value) : fmtNum(value, 1);
  return <svg className="dash-trend" viewBox="0 0 720 250" role="img" aria-label={`${label}${unit ? ` (${unit})` : ''}`}>
    {[0, 1, 2, 3].map((tick) => <g key={tick}><line x1="68" x2="688" y1={y(max * tick / 3)} y2={y(max * tick / 3)} className="dash-grid-line" /><text x="56" y={y(max * tick / 3) + 4} textAnchor="end">{format(max * tick / 3)}</text></g>)}
    {values.length > 0 && <><path d={`${path} L${x(values.length - 1)},210 L68,210 Z`} className="dash-area" /><path d={path} className="dash-line" />{values.map((value, index) => <circle key={index} cx={x(index)} cy={y(value)} r="3.5" className="dash-dot"><title>{monthName(months[index])}: {money ? fmtMoney(value) : `${fmtMaterialQty(value)} ${unit ?? ''}`}</title></circle>)}</>}
    {ticks.map((index) => <text key={index} x={x(index)} y="240" textAnchor={index === 0 ? 'start' : index === months.length - 1 ? 'end' : 'middle'}>{monthName(months[index])}</text>)}
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
  return <div className="dashboard-page">
    <header className="inventory-heading"><div><div className="inventory-eyebrow">Workspace overview</div><h1>Dashboard</h1><p>Customers, quoted products and material demand. One view over time.</p></div><button onClick={() => setRefresh(refresh + 1)} disabled={loading}>↻ Refresh data</button></header>
    <section className="dash-filters"><label>Period<select aria-label="Dashboard period" value={range} onChange={(event) => setRange(event.target.value)}><option value="all">All time</option><option value="1m">Last month</option><option value="6m">Last 6 months</option><option value="1y">Last year</option><option value="custom">Custom dates</option></select></label><label>Customer<select aria-label="Dashboard customer" value={customer} onChange={(event) => setCustomer(event.target.value)}><option value="">All customers</option>{data?.customers.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>Quotation status<select aria-label="Dashboard status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All quotations</option><option value="active">Confirmed only</option><option value="draft">Drafts only</option></select></label>{range === 'custom' && <><label>From<input type="date" aria-label="Dashboard start date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" aria-label="Dashboard end date" value={to} onChange={(event) => setTo(event.target.value)} /></label></>}<span className="dash-filter-caption">By quotation date{data && ` · ${data.from} → ${data.to}`}</span></section>
    {error && <div className="error-box" role="alert">{error} <button onClick={() => setRefresh(refresh + 1)}>Retry</button></div>}
    {loading && <div className="dash-loading" role="status">Loading your dashboard…</div>}
    {!loading && range === 'custom' && (!from || !to) && <section className="panel muted">Choose a start and end date.</section>}
    {!loading && !error && data && (range !== 'custom' || (from && to)) && <>
      <div className="dash-kpis">{[{ label: 'Customers', value: fmtNum(data.totals.customers), note: `${data.totals.projects} projects in this period`, icon: '♙' }, { label: 'Quotations', value: fmtNum(data.totals.quotations), note: `${data.totals.active} confirmed · ${data.totals.draft} draft`, icon: '≣' }, { label: 'Quoted products', value: fmtNum(data.totals.products), note: 'Distinct product / unit combinations', icon: '▦' }, { label: 'Materials used', value: fmtNum(data.totals.materials), note: 'Linked to quoted products', icon: '◇' }, { label: 'Estimated cost', value: fmtMoney(data.totals.estimatedCost), note: data.totals.uncostedItems ? `Partial · ${data.totals.uncostedItems} rows have no cost` : 'Quoted costs, not selling prices', icon: '↗' }].map((card) => <section className="dash-kpi" key={card.label}><div><span>{card.label}</span><span className="dash-kpi-icon" aria-hidden="true">{card.icon}</span></div><strong>{card.value}</strong><small>{card.note}</small></section>)}</div>
      {data.totals.quotations === 0 && <div className="dash-notice">No quotations in this selection. Try a wider period or another customer.</div>}
      <div className="dash-chart-grid">
        <section className="dash-card"><div className="dash-card-heading"><div><h2>Estimated cost over time</h2><p>Monthly quotation cost · EUR</p></div><span className="dash-chart-tag">Monthly</span></div><DashboardTrend months={months} values={data.months.map((month) => month.estimatedCost)} label="Monthly estimated quotation cost" money /></section>
        <section className="dash-card"><div className="dash-card-heading"><div><h2>Quotation activity</h2><p>Draft and confirmed quotations per month</p></div><div className="dash-legend"><span><i style={{ background: '#3c7eaa' }} />Confirmed</span><span><i style={{ background: '#bad0e2' }} />Draft</span></div></div><svg className="dash-trend" viewBox="0 0 720 250" role="img" aria-label="Monthly quotation activity histogram">{data.months.map((month, index) => { const width = 620 / data.months.length; const max = Math.max(...data.months.map((row) => row.quotations), 1); const active = month.active / max * 175; const draft = month.draft / max * 175; return <g key={month.month}><rect x={68 + index * width + width * .17} y={210 - active} width={width * .66} height={active} fill="#3c7eaa"><title>{monthName(month.month)}: {month.active} confirmed</title></rect><rect x={68 + index * width + width * .17} y={210 - active - draft} width={width * .66} height={draft} fill="#bad0e2"><title>{monthName(month.month)}: {month.draft} drafts</title></rect>{(index === 0 || index === data.months.length - 1 || index === Math.floor(data.months.length / 2)) && <text x={68 + index * width + width / 2} y="240" textAnchor="middle">{monthName(month.month)}</text>}</g>; })}<line x1="68" x2="688" y1="210" y2="210" className="dash-grid-line" /></svg></section>
      </div>
      <section className="dash-card"><div className="dash-card-heading"><div><h2>Customer portfolio</h2><p>Share of estimated quotation costs · click a customer to explore</p></div><button onClick={() => navigate({ page: 'customers' })}>All customers ↗</button></div><div className="dash-portfolio-bar">{data.clients.filter((client) => client.estimatedCost > 0).map((client, index) => <button key={client.id} title={`${client.name}: ${fmtMoney(client.estimatedCost)}`} aria-label={`Filter dashboard to ${client.name}`} onClick={() => setCustomer(client.id)} style={{ flex: client.estimatedCost / (totalClientCost || 1), background: colors[index % colors.length] }} />)}</div><div className="dash-client-grid">{data.clients.map((client, index) => <button key={client.id} onClick={() => navigate({ page: 'customers', id: client.id })}><span className="dash-client-dot" style={{ background: colors[index % colors.length] }} /><span><strong>{client.name}</strong><small>{client.projects} projects · {client.quotations} quotations</small></span><b>{fmtMoney(client.estimatedCost)}<small>{totalClientCost ? fmtNum(client.estimatedCost / totalClientCost * 100, 1) : 0}% of estimated cost</small></b></button>)}</div></section>
      <div className="dash-chart-grid">
        <section className="dash-card"><div className="dash-card-heading"><div><h2>Product usage over time</h2><p>Quoted quantities, in the selected product’s unit</p></div></div><select aria-label="Product usage chart" value={product?.key ?? ''} onChange={(event) => setProductKey(event.target.value)} disabled={!data.products.length}>{!data.products.length && <option>No quoted products</option>}{data.products.map((row) => <option key={row.key} value={row.key}>{row.name} ({row.unit})</option>)}</select>{product && <><div className="dash-selected-value"><strong>{fmtMaterialQty(product.quantity)} <small>{product.unit}</small></strong><span>across {product.quotations} quotations</span></div><DashboardTrend months={months} values={product.trend} label={`${product.name} quoted quantities`} unit={product.unit} /></>}</section>
        <section className="dash-card"><div className="dash-card-heading"><div><h2>Material demand over time</h2><p>Bill-of-material quantities × quoted product quantities</p></div></div><select aria-label="Material demand chart" value={material?.id ?? ''} onChange={(event) => setMaterialId(event.target.value)} disabled={!data.materials.length}>{!data.materials.length && <option>No linked materials</option>}{data.materials.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.unit})</option>)}</select>{material && <><div className="dash-selected-value"><strong>{fmtMaterialQty(material.quantity)} <small>{material.unit}</small></strong><span>{material.mockQuantity > 0 ? `${fmtMaterialQty(material.mockQuantity)} ${material.unit} uses mock BOM quantities` : 'Based on historical BOM quantities'}</span></div><DashboardTrend months={months} values={material.trend} label={`${material.name} material demand`} unit={material.unit} /></>}</section>
      </div>
      <div className="dash-chart-grid">
        <section className="dash-card dash-table-card"><div className="dash-card-heading"><div><h2>Most used products</h2><p>Ranked by the number of quotations using each product</p></div></div><div className="table-scroll"><table className="inventory-table"><thead><tr><th>Product</th><th className="inventory-number">Quoted quantity</th><th className="inventory-number">Quotations</th></tr></thead><tbody>{data.products.slice(0, 10).map((row, index) => <tr key={row.key}><td><div className="dash-ranked"><span>{index + 1}</span><button className="inventory-link" onClick={() => row.id ? navigate({ page: 'product', id: row.id }) : setProductKey(row.key)}>{row.name}</button></div></td><td className="inventory-number">{fmtMaterialQty(row.quantity)} <small>{row.unit}</small></td><td className="inventory-number">{row.quotations}</td></tr>)}</tbody></table></div></section>
        <section className="dash-card dash-table-card"><div className="dash-card-heading"><div><h2>Material usage</h2><p>Material quantities retain their own units</p></div></div><div className="table-scroll"><table className="inventory-table"><thead><tr><th>Material</th><th className="inventory-number">Demand</th><th className="inventory-number">Products</th></tr></thead><tbody>{data.materials.slice(0, 10).map((row) => <tr key={row.id}><td><button className="inventory-link" onClick={() => navigate({ page: 'materials', id: row.id })}>{row.name}</button>{row.mockQuantity > 0 && <small className="inventory-cell-sub">Includes mock quantities</small>}</td><td className="inventory-number">{fmtMaterialQty(row.quantity)} <small>{row.unit}</small></td><td className="inventory-number">{row.products}</td></tr>)}</tbody></table></div></section>
      </div>
      <p className="dash-footnote">Usage reflects quotation demand, not purchases or delivered production. Multiple quotations and revisions are counted separately. Costs are estimates, not selling prices.{data.totals.unmappedLines > 0 && ` ${data.totals.unmappedLines} quotation rows have no material links.`}{data.totals.incompatibleLines > 0 && ` ${data.totals.incompatibleLines} rows have incompatible BOM units; those material quantities are excluded.`}</p>
    </>}
  </div>;
}
