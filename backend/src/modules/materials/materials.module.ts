import { Module } from '@nestjs/common';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { MaterialPricesService } from './material-prices.service';

@Module({ controllers: [MaterialsController], providers: [MaterialsService, MaterialPricesService] })
export class MaterialsModule {}
