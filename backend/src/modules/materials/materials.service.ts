import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MaterialDetail, ProductMaterial, RawMaterial } from '../../common/interfaces/material.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<RawMaterial[]> {
    const rows = await this.prisma.rawMaterial.findMany({ include: { _count: { select: { products: true } } }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
    return rows.map(({ _count, ...material }) => ({ ...material, productCount: _count.products }));
  }

  async productMaterials(productId: string): Promise<ProductMaterial[]> {
    const [reference, custom] = await Promise.all([
      this.prisma.referenceTab.findUnique({ where: { id: productId }, select: { id: true } }),
      this.prisma.customProduct.findUnique({ where: { id: productId }, select: { id: true } }),
    ]);
    if (!reference && !custom) throw new NotFoundException('Product not found');
    return this.prisma.productMaterial.findMany({ where: { OR: [{ referenceTabId: productId }, { customProductId: productId }] }, include: { material: true }, orderBy: { material: { name: 'asc' } } });
  }

  async detail(id: string): Promise<MaterialDetail> {
    const row = await this.prisma.rawMaterial.findUnique({ where: { id }, include: { products: { include: { referenceTab: true, customProduct: true } } } });
    if (!row) throw new NotFoundException('Material not found');
    const { products, ...material } = row;
    return { material: { ...material, productCount: products.length }, products: products.map((link) => {
      const product = link.referenceTab ?? link.customProduct;
      if (!product) throw new Error(`Material link ${link.id} has no product`);
      return { id: product.id, title: product.title ?? product.description ?? product.id, itemCode: product.itemCode, lot: link.referenceTab?.lotto ?? null, quantity: link.quantity, productUnit: link.productUnit, quantitySource: link.quantitySource };
    }) };
  }

  async updatePrice(id: string, unitCost: unknown): Promise<void> {
    if (typeof unitCost !== 'number' || !Number.isFinite(unitCost) || unitCost < 0) throw new BadRequestException('Unit cost must be a non-negative number');
    const material = await this.prisma.rawMaterial.findUnique({ where: { id }, select: { id: true } });
    if (!material) throw new NotFoundException('Material not found');
    await this.prisma.rawMaterial.update({ where: { id }, data: { unitCost, priceSource: 'manual', sourceNote: 'Raw-material estimate entered by a workspace user.' } });
  }
}
