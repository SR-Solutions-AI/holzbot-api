import { Module } from '@nestjs/common';
import { ComputeController, CalcEventsPollingController } from './compute.controller';
import { ComputeService } from './compute.service';
import { CalcEventsModule } from '../calc-events/calc-events.module';

@Module({
  imports: [
    CalcEventsModule, // ✅ Pentru CalcEventsService
  ],
  controllers: [
    ComputeController,              // /offers/:offerId/compute
    CalcEventsPollingController,    // /calc-events (polling)
  ],
  providers: [ComputeService],
  exports: [ComputeService],
})
export class ComputeModule {}