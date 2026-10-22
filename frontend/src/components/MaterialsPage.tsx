import { useEffect, useState } from 'react';
import { api, fmtMaterialQty, type RawMaterial, type MaterialDetail } from '../api';
import { navigate } from '../route';
import { Icon } from './Icon';
import { MaterialPriceChart } from './MaterialPriceChart';
import '../materials.css';

export function MaterialsPage({ materialId, onError }: { materialId?: string; onError: (message: string) => void }) {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [detail, setDetail] = useState<MaterialDetail | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true); setDetail(null); setPage(1);
    const task = materialId ? api.material(materialId).then((data) => { if (live) { setDetail(data); } }) : api.materials().then((data) => { if (live) setMaterials(data); });
    task.catch((error: unknown) => { if (live) onError(error instanceof Error ? error.message : String(error)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [materialId, onError]);
  const categories = [...new Set(materials.map((material) => material.category))].sort();
  const list = materials.filter((material) => (!category || material.category === category) && `${material.name} ${material.code} ${material.category}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'products' ? b.productCount - a.productCount : a.name.localeCompare(b.name));
  const products = detail?.products.filter((product) => `${product.title} ${product.itemCode ?? ''} ${product.lot ?? ''}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const count = detail ? products.length : list.length;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  return <div className="inventory-page">
    <header className="inventory-heading">
      <div><div className="inventory-eyebrow">{materialId ? 'Material details' : 'Material library'}</div><h1>{detail?.material.name ?? 'Raw materials'}</h1><p>Market trends, material quantities and the products that use them.</p></div>
      {materialId ? <button onClick={() => { setQuery(''); navigate({ page: 'materials' }); }}>← All materials</button> : <div className="inventory-heading-count"><strong>{materials.length}</strong><span>materials</span></div>}
    </header>
    {detail && <MaterialPriceChart key={detail.material.id} materialId={detail.material.id} />}
    <section className="inventory-card">
      <div className="inventory-toolbar">
        <label className="inventory-search"><Icon name="search" size={16} /><input aria-label="Search materials" placeholder={detail ? 'Search products, codes or lots…' : 'Search materials or codes…'} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
        {!detail && <><select aria-label="Filter material category" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Sort materials" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="name">Name A–Z</option><option value="products">Most used</option></select></>}
      </div>
      <div className="table-scroll"><table className="inventory-table material-table">
        <colgroup>{detail ? <><col style={{ width: '45%' }} /><col style={{ width: '15%' }} /><col style={{ width: '24%' }} /><col style={{ width: '16%' }} /></> : <><col style={{ width: '55%' }} /><col style={{ width: '30%' }} /><col style={{ width: '15%' }} /></>}</colgroup>
        <thead>{detail ? <tr><th>Product</th><th>Lot</th><th className="inventory-number">Material quantity</th><th>Quantity source</th></tr> : <tr><th>Material</th><th>Category</th><th className="inventory-number">Products</th></tr>}</thead>
        <tbody>{!loading && (detail ? products.slice((page - 1) * pageSize, page * pageSize).map((product) => <tr key={product.id}>
          <td><button className="inventory-link" onClick={() => navigate({ page: 'product', id: product.id })}>{product.title}</button><span className="inventory-cell-sub inventory-code">{product.itemCode}</span></td>
          <td><span className="lot-label">{product.lot ?? 'Not assigned'}</span></td>
          <td className="inventory-number"><span className="inventory-cell-main">{fmtMaterialQty(product.quantity)} {detail.material.unit}</span><span className="inventory-cell-sub">per 1 {product.productUnit}</span></td>
          <td><span className={`inventory-badge ${product.quantitySource === 'mock' ? 'mock' : 'historical'}`}>{product.quantitySource === 'mock' ? 'Estimated' : 'Historical'}</span></td>
        </tr>) : list.slice((page - 1) * pageSize, page * pageSize).map((material) => <tr key={material.id}>
          <td><div className="inventory-identity"><span className="material-mark" aria-hidden="true">{material.category === 'Glass' ? '◇' : material.category === 'Timber' ? '≋' : '▱'}</span><div><button className="inventory-link" onClick={() => { setQuery(''); navigate({ page: 'materials', id: material.id }); }}>{material.name}<span className="inventory-link-arrow" aria-hidden="true">↗</span></button><span className="inventory-cell-sub inventory-code">{material.code}</span></div></div></td>
          <td><span className="inventory-category">{material.category}</span></td>
          <td className="inventory-number"><span className="inventory-count">{material.productCount}</span></td>
        </tr>))}</tbody>
      </table></div>
      {loading && <div className="inventory-empty">Loading materials…</div>}
      {!loading && count === 0 && <div className="inventory-empty"><strong>No matching {detail ? 'products' : 'materials'}</strong><span>Try a different search or category.</span></div>}
      <footer className="inventory-pagination"><span>{count ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, count)} of {count} {detail ? 'products' : 'materials'}</span><div><label>Rows<select aria-label="Materials per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label><button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">←</button><span className="inventory-page-number">{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">→</button></div></footer>
    </section>
  </div>;
}
