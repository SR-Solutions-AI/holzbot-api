// apps/api/src/files/files.controller.ts
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AnyAuthGuard } from '../auth/any-auth.guard';
import { FilesService } from './files.service';

@Controller('offers/:offerId/file')
@UseGuards(AnyAuthGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('presign')
  async presign(@Req() req: any, @Param('offerId') offerId: string, @Body() body: any) {
    const { filename } = body ?? {};
    if (!filename) return { ok: false, error: 'filename required' };
    return this.files.createPresigned(req.user?.id, offerId, filename);
  }

  @Post()
  async register(@Req() req: any, @Param('offerId') offerId: string, @Body() body: any) {
    const { storagePath, meta } = body ?? {};
    if (!storagePath) return { ok: false, error: 'storagePath required' };
    return this.files.registerFile(req.user?.id, offerId, storagePath, meta);
  }
}
