import { BadRequestException, Body, Controller, Param, Post } from '@nestjs/common';
import { CatalogService } from '../catalog/catalog.service';
import { CostingService } from '../costing/costing.service';
import { itemFromCatalog } from './quotation.rules';
import type { QuotationItem } from '../../common/interfaces/quotation.interface';

interface PreviewDto {
  quantity?: number;
  L?: number | null;
  H?: number | null;
  description?: string;
  params?: Array<{ cell: string; value: number | string | null }>;
}

/** Recalculates a catalog product's unit cost for customized specs, without saving anything. */
@Controller('catalog')
export class ProductPreviewController {
  constructor(private readonly catalog: CatalogService, private readonly costing: CostingService) {}

  @Post(':id/preview')
  async preview(@Param('id') id: string, @Body() body: PreviewDto): Promise<{ unitCost: number | null; historicalUnitCost: number | null; totalCost: number | null; computed: boolean; m2Unit: number | null }> {
    const rec = this.catalog.get(id);
    const quantity = Number(body.quantity ?? rec.quantity ?? 1);
    if (!(quantity > 0) || quantity > 1e7) throw new BadRequestException('Quantity must be a positive number');
    const item = itemFromCatalog(rec, quantity);
    for (const p of body.params ?? []) {
      const target = item.params.find((x) => x.cell === p.cell);
      if (target && (p.value === null || typeof p.value === 'number' || typeof p.value === 'string')) target.value = p.value;
    }
    const L = body.L === undefined ? item.L : body.L;
    const H = body.H === undefined ? item.H : body.H;
    const preview: QuotationItem = { ...item, id: 'preview', quantity, L, H, description: typeof body.description === 'string' && body.description.trim() ? body.description : item.description };
    const res = await this.costing.compute(preview);
    const unitCost = res?.unitCost ?? null;
    return { unitCost: unitCost ?? rec.unitCost, historicalUnitCost: rec.unitCost, totalCost: unitCost !== null ? unitCost * quantity : rec.unitCost !== null ? rec.unitCost * quantity : null, computed: unitCost !== null, m2Unit: L && H ? (L * H) / 1e6 : null };
  }
}
