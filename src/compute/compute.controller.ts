import {
  Controller,
  Post,
  Body, // Get a fost scos daca nu mai e folosit aici
  Param,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AnyAuthGuard } from '../auth/any-auth.guard';
import { ComputeService } from './compute.service';

@Controller('offers/:offerId')
@UseGuards(AnyAuthGuard)
export class ComputeController {
  constructor(private readonly computeService: ComputeService) {}

  /**
   * POST /offers/:offerId/compute
   * Pornește calculul pentru o ofertă
   */
  @Post('compute')
  async compute(@Req() req: any, @Param('offerId') offerId: string, @Body() body: any) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('User ID missing');

    return this.computeService.start(userId, offerId);
  }

  /**
   * POST /offers/:offerId/compute/finish-ok
   * Marchează calculul ca finalizat cu succes
   */
  @Post('compute/finish-ok')
  async finishOk(
    @Req() req: any,
    @Param('offerId') offerId: string,
    @Body() body: { run_id: string; result?: any }
  ) {
    const userId = req.user?.id || 'engine';
    const { run_id, result } = body;

    if (!run_id) throw new BadRequestException('run_id required');

    return this.computeService.finishOk(userId, offerId, run_id, result || {});
  }

  /**
   * POST /offers/:offerId/compute/finish-fail
   * Marchează calculul ca eșuat
   */
  @Post('compute/finish-fail')
  async finishFail(
    @Req() req: any,
    @Param('offerId') offerId: string,
    @Body() body: { run_id: string; error?: any }
  ) {
    const userId = req.user?.id || 'engine';
    const { run_id, error } = body;

    if (!run_id) throw new BadRequestException('run_id required');

    return this.computeService.finishFail(userId, offerId, run_id, error || {});
  }
}

// ❌ CLASA CalcEventsPollingController A FOST ștearsă DE AICI pentru a evita conflictul