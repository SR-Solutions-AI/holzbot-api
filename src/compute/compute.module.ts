import { Module } from '@nestjs/common';
import { ComputeController } from './compute.controller'; // Scoatem CalcEventsPollingController din import
import { ComputeService } from './compute.service';
import { CalcEventsModule } from '../calc-events/calc-events.module';

@Module({
  imports: [
    CalcEventsModule, 
  ],
  controllers: [
    ComputeController,              // Doar controllerul de compute
    // ❌ CalcEventsPollingController a fost șters
  ],
  providers: [ComputeService],
  exports: [ComputeService],
})
export class ComputeModule {}