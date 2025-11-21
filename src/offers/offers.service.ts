// apps/api/src/offers/offers.service.ts
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException
} from '@nestjs/common';
import { getSupabaseAdmin } from '../common/supabase';

const supabaseAdmin = getSupabaseAdmin();

type Cursor = { created_at: string; id: string };
function encodeCursor(c: Cursor) {
  return Buffer.from(`${c.created_at}|${c.id}`).toString('base64');
}
function decodeCursor(s: string): Cursor {
  const [created_at, id] = Buffer.from(s, 'base64')
    .toString('utf8')
    .split('|');
  return { created_at, id };
}

@Injectable()
export class OffersService {
  private async getTenantId(userId: string): Promise<string> {
    const { data: prof, error } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', userId)
      .single();
    if (error || !prof) throw new UnauthorizedException('Profile missing for user');
    return prof.tenant_id as string;
  }

  // POST /offers
  async createOffer(userId: string, { title }: { title?: string }) {
    const tenantId = await this.getTenantId(userId);
    const { data, error } = await supabaseAdmin
      .from('offers')
      .insert({
        tenant_id: tenantId,
        title: title ?? 'Ofertă nouă',
        status: 'draft',
        meta: null,
        result: null,
      })
      .select('id')
      .single();
    if (error) throw error;
    return { id: data.id };
  }

  // PATCH /offers/:id (e.g. rename)
  async updateOffer(userId: string, offerId: string, updates: { title?: string }) {
    const tenantId = await this.getTenantId(userId);
    const { error } = await supabaseAdmin
        .from('offers')
        .update(updates)
        .eq('id', offerId)
        .eq('tenant_id', tenantId);
    if (error) throw new BadRequestException(error.message);
    return { ok: true };
  }

  // POST /offers/:id/step (Upsert step data)
  async saveStep(userId: string, offerId: string, stepKey: string, stepData: any) {
    const tenantId = await this.getTenantId(userId);
    
    // Verify offer ownership
    const { data: offer } = await supabaseAdmin
      .from('offers')
      .select('id')
      .eq('id', offerId)
      .eq('tenant_id', tenantId)
      .single();
    if (!offer) throw new NotFoundException('Offer not found');

    // Upsert logic for offer_steps
    // Requires a unique constraint on (offer_id, step_key) in DB
    const { error } = await supabaseAdmin
      .from('offer_steps')
      .upsert({
        offer_id: offerId,
        step_key: stepKey,
        data: stepData,
        submitted_at: new Date().toISOString(),
        // tenant_id might be needed depending on your DB schema for steps, 
        // but usually offer_id is enough if RLS checks offer ownership
      }, { onConflict: 'offer_id, step_key' });

    if (error) throw new BadRequestException(error.message);
    return { ok: true };
  }

  // GET /offers
  async listOffers(userId: string, limit = 20, cursor?: string) {
    const tenantId = await this.getTenantId(userId);

    const q = supabaseAdmin
      .from('offers')
      .select('id,title,status,meta,created_at', { count: 'exact', head: false })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 50));

    if (cursor) {
      const c = decodeCursor(cursor);
      q.or(
        `and(created_at.lt.${c.created_at}),and(created_at.eq.${c.created_at},id.lt.${c.id})`,
      );
    }

    const { data, error } = await q;
    if (error) throw error;

    let nextCursor: string | undefined = undefined;
    const pageSize = Math.min(Math.max(limit, 1), 50);
    if (data && data.length === pageSize) {
      const last = data[data.length - 1];
      nextCursor = encodeCursor({
        created_at: last.created_at as string,
        id: last.id as string,
      });
    }

    return { items: data ?? [], nextCursor };
  }

  // GET /offers/:id
  async getOfferDetail(userId: string, offerId: string) {
    const tenantId = await this.getTenantId(userId);

    const { data: offer, error: offerErr } = await supabaseAdmin
      .from('offers')
      .select(
        'id,title,status,meta,result,created_at,updated_at,tenant_id',
      )
      .eq('id', offerId)
      .eq('tenant_id', tenantId)
      .single();
    if (offerErr || !offer) throw new NotFoundException('Offer not found');

    const { data: steps, error: stepsErr } = await supabaseAdmin
      .from('offer_steps')
      .select('step_key,form_version,ui_snapshot,data,submitted_at')
      .eq('offer_id', offerId)
      .order('submitted_at', { ascending: true });
    if (stepsErr) throw stepsErr;

    const { data: files, error: filesErr } = await supabaseAdmin
      .from('offer_files')
      .select('id,storage_path,meta,created_at')
      .eq('offer_id', offerId)
      .order('created_at', { ascending: true });
    if (filesErr) throw filesErr;

    const { tenant_id, ...cleanOffer } = offer;
    return {
      offer: cleanOffer,
      steps: steps ?? [],
      files: files ?? [],
      result: offer.result,
    };
  }
}