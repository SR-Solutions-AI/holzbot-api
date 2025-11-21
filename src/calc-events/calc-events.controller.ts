// apps/api/src/calc-events/calc-events.controller.ts
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { SupabaseJwtGuard } from '../auth/supabase.guard';
import { CalcEventsService } from './calc-events.service';

@Controller('calc-events')
@UseGuards(SupabaseJwtGuard)
export class CalcEventsController {
  constructor(private readonly service: CalcEventsService) {}

  /**
   * GET /calc-events?run_id=xxx&sinceId=yyy
   * Polling în timpul procesării
   */
  @Get()
  async getEvents(
    @Req() req: any,
    @Query('run_id') runId?: string,
    @Query('sinceId') sinceId?: string
  ) {
    if (!runId) {
      return { items: [] };
    }

    const since = sinceId ? parseInt(sinceId, 10) : undefined;
    return this.service.getEvents(req.user.id, runId, since);
  }

  /**
   * GET /calc-events/history?offer_id=xxx
   * Încarcă toate evenimentele pentru o ofertă veche
   */
  @Get('history')
  async getHistory(@Req() req: any, @Query('offer_id') offerId?: string) {
    if (!offerId) {
      return { items: [], run_id: null };
    }

    return this.service.getHistoryForOffer(req.user.id, offerId);
  }
}