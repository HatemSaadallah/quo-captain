export interface DashboardData {
  from: string;
  to: string;
  customers: Array<{ id: string; name: string }>;
  totals: { customers: number; projects: number; quotations: number; draft: number; active: number; estimatedCost: number; uncostedItems: number; products: number; materials: number; unmappedLines: number; incompatibleLines: number };
  months: Array<{ month: string; quotations: number; active: number; draft: number; estimatedCost: number }>;
  clients: Array<{ id: string; name: string; projects: number; quotations: number; estimatedCost: number; trend: number[] }>;
  products: Array<{ key: string; id: string | null; name: string; unit: string; quantity: number; quotations: number; estimatedCost: number; trend: number[] }>;
  materials: Array<{ id: string; name: string; unit: string; quantity: number; quotations: number; products: number; mockQuantity: number; trend: number[] }>;
}
