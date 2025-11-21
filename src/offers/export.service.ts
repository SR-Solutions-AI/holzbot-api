import { Injectable, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { getSupabaseAdmin } from '../common/supabase';

const supa = getSupabaseAdmin();
const BUCKET = process.env.SUPABASE_BUCKET || 'house-plans';

type OfferFileRow = {
  id: string;
  storage_path: string;
  meta: any;
  created_at: string;
};

@Injectable()
export class ExportService {
  private async getTenantIdFromProfile(userId: string) {
    const { data, error } = await supa
      .from('profiles')
      .select('tenant_id')
      .eq('id', userId)
      .single();
    if (error || !data) throw new UnauthorizedException('Profile missing');
    return data.tenant_id as string;
  }

  private async getTenantIdFromOffer(offerId: string) {
    const { data, error } = await supa
      .from('offers')
      .select('tenant_id')
      .eq('id', offerId)
      .single();
    if (error || !data) throw new NotFoundException('Offer not found');
    return data.tenant_id as string;
  }

  private async assertOfferTenant(offerId: string, tenantId: string) {
    const { data } = await supa
      .from('offers')
      .select('id,tenant_id')
      .eq('id', offerId)
      .single();
    if (!data || data.tenant_id !== tenantId) throw new NotFoundException('Offer not found');
  }

  private async signedDownloadUrl(path: string, expiresSec = 600) {
    const { data, error } = await supa.storage.from(BUCKET).createSignedUrl(path, expiresSec);
    if (error || !data) return null;
    return data.signedUrl;
  }

  private isImageMeta(meta: any): boolean {
    const kind = String(meta?.kind || '').toLowerCase();
    const mime = String(meta?.mime || meta?.contentType || '').toLowerCase();
    return (
      ['planjpg', 'planarhitectural', 'plan', 'plan_original'].includes(kind) ||
      mime.startsWith('image/')
    );
  }

  private isPdfMeta(meta: any): boolean {
    const kind = String(meta?.kind || '').toLowerCase();
    const mime = String(meta?.mime || meta?.contentType || '').toLowerCase();
    return kind === 'offerpdf' || mime === 'application/pdf' || mime.endsWith('/pdf');
  }

  private pickPlanFile(files: OfferFileRow[]): OfferFileRow | null {
    const byKind =
      files.find(f => String(f.meta?.kind).toLowerCase() === 'planarhitectural') ||
      files.find(f => String(f.meta?.kind).toLowerCase() === 'planjpg');
    if (byKind) return byKind;
    const firstImage = files.find(f => this.isImageMeta(f.meta));
    return firstImage || null;
  }

  private pickPdfFile(files: OfferFileRow[]): OfferFileRow | null {
    const byKind = files.find(f => String(f.meta?.kind).toLowerCase() === 'offerpdf');
    if (byKind) return byKind;
    const anyPdf = files.find(f => this.isPdfMeta(f.meta));
    return anyPdf || null;
  }

  async exportOffer(userId: string, offerId: string) {
    const tenantId =
      userId === 'engine'
        ? await this.getTenantIdFromOffer(offerId)
        : await this.getTenantIdFromProfile(userId);

    await this.assertOfferTenant(offerId, tenantId);

    const { data: offer } = await supa
      .from('offers')
      .select('id,title,status,meta,created_at,updated_at')
      .eq('id', offerId)
      .eq('tenant_id', tenantId)
      .single();

    const { data: steps } = await supa
      .from('offer_steps')
      .select('step_key,data,submitted_at')
      .eq('offer_id', offerId)
      .order('submitted_at', { ascending: true });

    const merged: Record<string, any> = {};
    for (const s of steps ?? []) Object.assign(merged, s.data ?? {});

   const { data: files } = await supa
      .from('offer_files')
      .select('id,storage_path,meta,created_at')
      .eq('offer_id', offerId)
      .order('created_at', { ascending: false }); // <--- AICI schimbă în false

    const all = (files ?? []) as OfferFileRow[];

    const planFile = this.pickPlanFile(all);
    const planSignedUrl = planFile ? await this.signedDownloadUrl(planFile.storage_path) : null;

    const pdfFile = this.pickPdfFile(all);
    const pdfSignedUrl = pdfFile ? await this.signedDownloadUrl(pdfFile.storage_path) : null;

    // ⭐ IMPORTANT: returnează și câmpurile legacy pentru compatibilitate
    return {
      offer,
      data: merged,
      // ✅ Câmpuri noi (structurate)
      files: {
        plan: planFile
          ? {
              id: planFile.id,
              meta: planFile.meta,
              storage_path: planFile.storage_path,
              download_url: planSignedUrl,
            }
          : null,
        pdf: pdfFile
          ? {
              id: pdfFile.id,
              meta: pdfFile.meta,
              storage_path: pdfFile.storage_path,
              download_url: pdfSignedUrl,
            }
          : null,
        all: all,
      },
      // ✅ Câmpuri legacy pentru backward compatibility
      pdf: pdfSignedUrl, // pentru Python (offer_pdf.py)
      download_url: pdfSignedUrl, // pentru StepWizard fallback
    };
  }

  // ⭐ ENDPOINT NOU: /offers/:id/export-url (pentru refresh URL semnat)
  async getExportUrl(userId: string, offerId: string) {
    const tenantId =
      userId === 'engine'
        ? await this.getTenantIdFromOffer(offerId)
        : await this.getTenantIdFromProfile(userId);

    await this.assertOfferTenant(offerId, tenantId);

    const { data: files } = await supa
      .from('offer_files')
      .select('id,storage_path,meta,created_at')
      .eq('offer_id', offerId)
      .order('created_at', { ascending: true });

    const all = (files ?? []) as OfferFileRow[];
    const pdfFile = this.pickPdfFile(all);

    if (!pdfFile) {
      throw new NotFoundException('No PDF found for this offer');
    }

    const signedUrl = await this.signedDownloadUrl(pdfFile.storage_path, 600);
    if (!signedUrl) {
      throw new BadRequestException('Could not generate signed URL');
    }

    return {
      url: signedUrl,
      download_url: signedUrl, // alias
      pdf: signedUrl, // alias
      storage_path: pdfFile.storage_path,
      expires_in: 600,
    };
  }
}