import { Module } from '@nestjs/common';
import { OfferStepsController } from './offer-steps.controller';
import { OfferStepsService } from './offer-steps.service';

@Module({
  controllers: [OfferStepsController],
  providers: [OfferStepsService],
  exports: [OfferStepsService],
})
export class OfferStepsModule {}
