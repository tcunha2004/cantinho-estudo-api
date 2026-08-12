import { Controller, Get, UseGuards } from '@nestjs/common';
import { RegionsService } from './regions.service';
import { RegionPricingDto } from './dto/region-pricing.dto';
import { AuthGuard } from '../auth/guard/auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';

@Controller('regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  /* Tabela de preços por região — tela Informações, só para o admin. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Get('pricing')
  public async findPricing(): Promise<RegionPricingDto[]> {
    return await this.regionsService.findPricing();
  }
}
