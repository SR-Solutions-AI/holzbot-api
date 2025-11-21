import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { SupabaseJwtGuard } from '../auth/supabase.guard';
import { OfferStepsService } from './offer-steps.service';
import { SaveStepSchema } from './dto/save-step.dto';

@Controller('offers/:offerId/step')
@UseGuards(SupabaseJwtGuard)
export class OfferStepsController {
  constructor(private readonly stepsService: OfferStepsService) {}

  @Post()
  async save(@Req() req: any, @Param('offerId') offerId: string, @Body() body: unknown) {
    const parsed = SaveStepSchema.safeParse(body);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.flatten() };
    }
    const { step_key, data } = parsed.data;
    return this.stepsService.saveStep(req.user.id, offerId, step_key, data);
  }
}
