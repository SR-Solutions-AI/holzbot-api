import { Controller, Get, Param, Query, Req, UseGuards, Body, Post, Patch } from '@nestjs/common';
import { SupabaseJwtGuard } from '../auth/supabase.guard';
import { OffersService } from './offers.service';

@Controller('offers')
@UseGuards(SupabaseJwtGuard)
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get()
  async list(@Req() req: any, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    const userId = req.user.id as string;
    const lim = limit ? parseInt(limit, 10) : 20;
    return this.offersService.listOffers(userId, lim, cursor);
  }

  @Get(':id')
  async byId(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.id as string;
    return this.offersService.getOfferDetail(userId, id);
  }

  @Post()
  async create(@Req() req: any, @Body() body: { title?: string }) {
    const userId = req.user.id as string;
    return this.offersService.createOffer(userId, body);
  }
}
