import { Controller, Get, Query } from '@nestjs/common';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import { CurrentUser } from '../auth/auth.decorators';
import { DashboardService, type DashboardFilters } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  @Get()
  get(@CurrentUser() user: AuthUser, @Query() filters: DashboardFilters) { return this.dashboard.get(user.id, filters); }
}
