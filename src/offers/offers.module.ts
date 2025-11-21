import { Module } from '@nestjs/common';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { ExportService } from './export.service';
import { OfferExportController } from './export.controller';

@Module({
  imports: [], // ExportService nu are dependențe pe FilesModule
  controllers: [
    OfferExportController,
    OffersController, // ← IMPORTANT: expune /offers/:offerId/export
  ],
  providers: [OffersService, ExportService],
  exports: [OffersService, ExportService],
})
export class OffersModule {}
