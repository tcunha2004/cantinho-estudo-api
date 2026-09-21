import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { RegionsService } from './regions.service';
import { RegionPricingDto } from './dto/region-pricing.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
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

  /* Reajuste das taxas da região, pela tela Informações. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id')
  public async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRegionDto,
  ): Promise<RegionPricingDto> {
    return await this.regionsService.update(id, dto);
  }
}
