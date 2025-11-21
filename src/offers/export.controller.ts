import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AnyAuthGuard } from '../auth/any-auth.guard';
import { ExportService } from './export.service';

@UseGuards(AnyAuthGuard)
@Controller('offers/:offerId')
export class OfferExportController {
  constructor(private readonly svc: ExportService) {}

  // Endpoint existent: GET /offers/:offerId/export
  @Get('export')
  async getExport(@Req() req: any, @Param('offerId') offerId: string) {
    return this.svc.exportOffer(req.user?.id, offerId);
  }

  // ENDPOINT NOU: GET /offers/:offerId/export-url
  // Pentru a obține un URL semnat fresh când cel vechi expiră
  @Get('export-url')
  async getExportUrl(@Req() req: any, @Param('offerId') offerId: string) {
    return this.svc.getExportUrl(req.user?.id, offerId);
  }
}