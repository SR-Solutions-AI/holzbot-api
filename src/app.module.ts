import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';

import { OffersModule } from './offers/offers.module';
import { OfferStepsModule } from './offer-steps/offer-steps.module';
import { FilesModule } from './files/files.module';
import { ComputeModule } from './compute/compute.module';
import { ValidatePlanController } from './validate-plan/validate-plan.controller';

// opțional: healthcheck simplu
import { Controller, Get } from '@nestjs/common';

@Controller('__health')
class HealthController {
  @Get()
  ok() { return { ok: true, t: Date.now() }; }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/api/.env'),
        '.env',
      ],
    }),
    OffersModule,
    OfferStepsModule,
    FilesModule,
    ComputeModule,
  ],
  controllers: [HealthController, ValidatePlanController],
})
export class AppModule {}
