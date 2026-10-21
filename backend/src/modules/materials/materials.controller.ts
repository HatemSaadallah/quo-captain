import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { MaterialPricesService } from './material-prices.service';
import { MaterialsService } from './materials.service';

@Controller()
export class MaterialsController {
  constructor(private readonly materials: MaterialsService, private readonly prices: MaterialPricesService) {}

  @Get('materials/:id/prices')
  pricesHistory(@Param('id') id: string, @Query('range') range?: string) { return this.prices.history(id, range); }

  @Get('materials')
  list() { return this.materials.list(); }

  @Get('materials/:id')
  detail(@Param('id') id: string) { return this.materials.detail(id); }

  @Get('catalog/:id/materials')
  product(@Param('id') id: string) { return this.materials.productMaterials(id); }

  @Patch('materials/:id')
  async updatePrice(@Param('id') id: string, @Body() body: { unitCost: number }) {
    await this.materials.updatePrice(id, body.unitCost);
    return { ok: true };
  }
}
