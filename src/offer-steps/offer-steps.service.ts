// apps/api/src/offer-steps/offer-steps.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../common/supabase';

const supabase = getSupabaseAdmin();

@Injectable()
export class OfferStepsService {
  private async getTenantId(userId: string): Promise<string> {
    const { data, error } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', userId)
      .single();
    if (error || !data) throw new UnauthorizedException('Profile missing for user');
    return data.tenant_id as string;
  }

  public async saveStep(userId: string, offerId: string, step_key: string, dataJson: any) {
    const tenantId = await this.getTenantId(userId);

    // 1) Offer -> tenant
    const { data: offer, error: offerErr } = await supabase
      .from('offers')
      .select('id, tenant_id')
      .eq('id', offerId)
      .single();
    if (offerErr || !offer || offer.tenant_id !== tenantId) {
      throw new NotFoundException('Offer not found');
    }

    // 2) latest form_definitions (optional)
    const { data: form, error: formErr } = await supabase
      .from('form_definitions')
      .select('version, ui_schema')
      .eq('tenant_id', tenantId)
      .eq('key', step_key)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (formErr) throw formErr;

    const formVersion: number = form?.version ?? 1;
    const uiSnapshot: any = form?.ui_schema ?? null;

    // 3) upsert idempotent — atenție la conflict target:
    //    majoritatea schemelor au UNIQ (tenant_id, offer_id, step_key)
    const { error: upsertErr } = await supabase
    .from('offer_steps')
    .upsert(
        {
        tenant_id: tenantId,
        offer_id: offerId,
        step_key,
        form_version: formVersion,
        data: dataJson ?? {},
        ui_snapshot: uiSnapshot,
        },
        { onConflict: 'offer_id,step_key' }, // ← revenim la indexul care există în tabel
    );

    if (upsertErr) throw new BadRequestException(upsertErr.message);

    // 4) mic summary (list view)
    try {
      if (step_key === 'dateGenerale') {
        const ref = typeof dataJson?.referinta === 'string' ? dataJson.referinta : null;
        const beciRaw = dataJson?.beci;
        const beciVal = beciRaw === undefined || beciRaw === null ? null : Boolean(beciRaw);
        await supabase
          .from('offers')
          .update({ meta: { referinta: ref, beci: beciVal as boolean | null } })
          .eq('id', offerId)
          .eq('tenant_id', tenantId);
      }
    } catch {
      // non-fatal
    }

    return { ok: true };
  }
}
