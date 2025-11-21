// apps/api/src/calc-events/calc-events.service.ts
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { getSupabaseAdmin } from '../common/supabase';

const supabase = getSupabaseAdmin();

@Injectable()
export class CalcEventsService {
  private async getTenantId(userId: string): Promise<string> {
    const { data, error } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', userId)
      .single();
    if (error || !data) throw new UnauthorizedException('Profile missing');
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

  /**
   * Salvează un event în DB
   * Apelat din ComputeService când primește output de la Python
   */
  async saveEvent(
    offerId: string,
    runId: string,
    message: string,
    payload?: any,
    level: 'info' | 'error' | 'warn' = 'info'
  ) {
    const tenantId = await this.getTenantIdFromOffer(offerId);

    const { error } = await supabase.from('calc_events').insert({
      tenant_id: tenantId,
      offer_id: offerId,  // ✅ ADĂUGAT!
      run_id: runId,
      level,
      message,
      payload: payload || null,
    });

    if (error) {
      console.error('[CalcEvents] Failed to save event:', error);
      // Nu throw - nu vrem să oprim procesul pentru asta
    }
  }

  /**
   * GET /calc-events?run_id=xxx&sinceId=yyy
   * Pentru polling în timpul procesării
   */
  async getEvents(userId: string, runId: string, sinceId?: number) {
    const tenantId = await this.getTenantId(userId);

    let query = supabase
      .from('calc_events')
      .select('id,run_id,level,message,payload,created_at')
      .eq('tenant_id', tenantId)
      .eq('run_id', runId)
      .order('id', { ascending: true });

    if (sinceId) {
      query = query.gt('id', sinceId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return { items: data || [] };
  }

  /**
   * GET /calc-events/history?offer_id=xxx
   * Pentru încărcarea TUTUROR evenimentelor unei oferte vechi
   */
  async getHistoryForOffer(userId: string, offerId: string) {
    const tenantId = await this.getTenantId(userId);

    // Verifică ownership
    const { data: offer } = await supabase
      .from('offers')
      .select('id,tenant_id')
      .eq('id', offerId)
      .eq('tenant_id', tenantId)
      .single();

    if (!offer) throw new NotFoundException('Offer not found');

    // Găsește ultimul run_id pentru această ofertă
    const { data: lastRun } = await supabase
      .from('calc_events')
      .select('run_id')
      .eq('offer_id', offerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastRun) {
      return { items: [], run_id: null };
    }

    // Încarcă toate evenimentele pentru ultimul run
    const { data: events, error } = await supabase
      .from('calc_events')
      .select('id,run_id,level,message,payload,created_at')
      .eq('offer_id', offerId)
      .eq('run_id', lastRun.run_id)
      .order('id', { ascending: true });

    if (error) throw error;

    return {
      items: events || [],
      run_id: lastRun.run_id,
    };
  }
}