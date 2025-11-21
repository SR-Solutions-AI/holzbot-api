// apps/api/src/calc-events/calc-events.module.ts
import { Module } from '@nestjs/common';
import { CalcEventsController } from './calc-events.controller';
import { CalcEventsService } from './calc-events.service';

@Module({
  controllers: [CalcEventsController],
  providers: [CalcEventsService],
  exports: [CalcEventsService], // pentru a fi folosit în ComputeService
})
export class CalcEventsModule {}