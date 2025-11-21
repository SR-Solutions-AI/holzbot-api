// apps/api/src/files/files.service.ts
import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../common/supabase';

const supabase = getSupabaseAdmin();
const BUCKET = process.env.SUPABASE_BUCKET || 'house-plans';

@Injectable()
export class FilesService {
  private async getTenantIdFromProfile(userId: string): Promise<string> {
    const { data, error } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', userId)
      .single();
    if (error || !data) throw new UnauthorizedException('Profile missing for user');
    return data.tenant_id as string;
  }

  private async getTenantIdFromOffer(offerId: string): Promise<string> {
    const { data, error } = await supabase
      .from('offers')
      .select('tenant_id')
      .eq('id', offerId)
      .single();
    if (error || !data) throw new NotFoundException('Offer not found');
    return data.tenant_id as string;
  }

  private async ensureOfferForTenant(offerId: string, tenantId: string) {
    const { data, error } = await supabase
      .from('offers')
      .select('id, tenant_id')
      .eq('id', offerId)
      .single();
    if (error || !data || data.tenant_id !== tenantId) {
      throw new NotFoundException('Offer not found');
    }
  }

  /**
   * Creează URL semnat de upload și întoarce și tokenul care TREBUIE pus în headerul Authorization la PUT.
   */
  async createPresigned(userId: string, offerId: string, filename: string) {
    const tenantId = userId === 'engine'
      ? await this.getTenantIdFromOffer(offerId)
      : await this.getTenantIdFromProfile(userId);

    await this.ensureOfferForTenant(offerId, tenantId);

    const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const path = `tenant_${tenantId}/offer_${offerId}/${randomUUID()}-${safeName}`;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Cannot create signed upload URL');
    }

    // IMPORTANT: uploadToken se folosește în Authorization: Bearer <token> la PUT
    return {
      uploadUrl: data.signedUrl,
      uploadToken: data.token,
      storagePath: path,
    };
  }

  async registerFile(userId: string, offerId: string, storagePath: string, meta?: any) {
    const tenantId = userId === 'engine'
      ? await this.getTenantIdFromOffer(offerId)
      : await this.getTenantIdFromProfile(userId);

    await this.ensureOfferForTenant(offerId, tenantId);

    const { data, error } = await supabase
      .from('offer_files')
      .insert({ tenant_id: tenantId, offer_id: offerId, storage_path: storagePath, meta: meta ?? null })
      .select('id')
      .single();

    if (error) throw new BadRequestException(error.message);
    return { file_id: data.id };
  }

  async createSignedDownloadUrl(storagePath: string, expiresSec = 600) {
    const { data, error } = await supabase
      .storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresSec);
    if (error || !data) throw new BadRequestException(error?.message ?? 'Cannot create signed download URL');
    return data.signedUrl;
  }
}
