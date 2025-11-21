import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  InternalServerErrorException,
  Logger
} from '@nestjs/common';
import { getSupabaseAdmin } from '../common/supabase';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as mime from 'mime-types';
import { mapStepsToFrontendData } from './compute.utils';
import { CalcEventsService } from '../calc-events/calc-events.service';

const supa = getSupabaseAdmin();
const BUCKET = process.env.SUPABASE_BUCKET || 'house-plans';

@Injectable()
export class ComputeService {
  private readonly logger = new Logger(ComputeService.name);

  constructor(private readonly calcEvents: CalcEventsService) {}

  private async getTenantIdFromProfile(userId: string) {
    const { data, error } = await supa.from('profiles').select('tenant_id').eq('id', userId).single();
    if (error || !data) throw new UnauthorizedException('Profile missing');
    return data.tenant_id as string;
  }

  private async getTenantIdFromOffer(offerId: string) {
    const { data, error } = await supa.from('offers').select('tenant_id').eq('id', offerId).single();
    if (error || !data) throw new NotFoundException('Offer not found');
    return data.tenant_id as string;
  }

  private async assertOfferTenant(offerId: string, tenantId: string) {
    const { data, error } = await supa.from('offers').select('id, tenant_id').eq('id', offerId).single();
    if (error || !data || data.tenant_id !== tenantId) throw new NotFoundException('Offer not found');
  }

  async start(userId: string, offerId: string) {
    const tenantId = await this.getTenantIdFromProfile(userId);
    await this.assertOfferTenant(offerId, tenantId);

    const { data: existing } = await supa
      .from('calc_runs')
      .select('id,status')
      .eq('offer_id', offerId)
      .eq('tenant_id', tenantId)
      .eq('status', 'running')
      .maybeSingle();

    if (existing) return { run_id: existing.id };

    const { data: run, error: runErr } = await supa
      .from('calc_runs')
      .insert({ tenant_id: tenantId, offer_id: offerId, status: 'running' })
      .select('id')
      .single();

    if (runErr) throw new BadRequestException(runErr.message);

    await supa
      .from('offers')
      .update({ status: 'processing' })
      .eq('id', offerId)
      .eq('tenant_id', tenantId);

    try {
      // ✅ Modificare: Trimitem tenantId către funcția de spawn
      await this.prepareAndSpawn(offerId, run.id as string, tenantId);
      
      await this.calcEvents.saveEvent(
        offerId,
        run.id as string,
        'Pipeline initialized locally.',
        null,
        'info'
      );
      
      return { run_id: run.id as string };
    } catch (e: any) {
      await this.calcEvents.saveEvent(
        offerId,
        run.id as string,
        `Startup failed: ${e.message}`,
        null,
        'error'
      );
      
      try {
        await this.finishFail(userId, offerId, run.id as string, { message: e.message });
      } catch (err) {
        this.logger.error(`Failed to mark run as failed: ${err}`);
      }
      
      throw new InternalServerErrorException(e.message);
    }
  }

  /** * Helper: Urcă o imagine locală în Supabase și returnează URL-ul public ȘI calea de storage 
   */
  private async uploadFileToSupabase(offerId: string, filePath: string): Promise<{ publicUrl: string, storagePath: string } | null> {
    try {
      if (!fs.existsSync(filePath)) return null;

      const fileName = path.basename(filePath);
      const fileBuffer = fs.readFileSync(filePath);
      const contentType = mime.lookup(filePath) || 'application/octet-stream';
      const storagePath = `calc_runs/${offerId}/${Date.now()}_${fileName}`;

      const { error } = await supa.storage
        .from(BUCKET)
        .upload(storagePath, fileBuffer, { contentType, upsert: true });

      if (error) throw error;

      const { data } = supa.storage.from(BUCKET).getPublicUrl(storagePath);
      return { publicUrl: data.publicUrl, storagePath };
    } catch (err) {
      this.logger.error(`Upload failed for ${filePath}: ${err}`);
      return null;
    }
  }

  // ✅ Modificare: Primim tenantId ca argument
  private async prepareAndSpawn(offerId: string, runId: string, tenantId: string) {
    const { data: stepsData } = await supa
      .from('offer_steps')
      .select('step_key, data')
      .eq('offer_id', offerId);

    const aggregatedSteps: Record<string, any> = {};
    stepsData?.forEach(s => { aggregatedSteps[s.step_key] = s.data; });
    const frontendJson = mapStepsToFrontendData(aggregatedSteps);

    const { data: files } = await supa
      .from('offer_files')
      .select('*')
      .eq('offer_id', offerId)
      .order('created_at', { ascending: false });

    const planFile = files?.find(
      f => f.meta?.kind === 'planArhitectural' || 
           f.meta?.mime?.startsWith('image/') || 
           f.meta?.mime === 'application/pdf'
    );

    if (!planFile) throw new Error('No architectural plan found in uploads.');

    const jobDir = path.resolve(process.cwd(), 'jobs_output', offerId);
    if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

    const jsonPath = path.join(jobDir, 'frontend_data.json');
    fs.writeFileSync(jsonPath, JSON.stringify(frontendJson, null, 2), 'utf-8');

    // ✅ FIX: Pregătim JSON-ul ca string pentru Python
    const frontendDataJsonString = JSON.stringify(frontendJson);
    this.logger.log(`[${offerId}] 📊 Frontend data prepared: ${Object.keys(frontendJson).join(', ')}`);
  this.logger.log(`[${offerId}] 📊 Data length: ${frontendDataJsonString.length} chars`);
    this.logger.log(`[${offerId}] Frontend data prepared: ${Object.keys(frontendJson).join(', ')}`);

    const { data: fileBlob, error: dlError } = await supa.storage
      .from(BUCKET)
      .download(planFile.storage_path);

    if (dlError || !fileBlob) {
      throw new Error(`Storage download failed: ${dlError?.message}`);
    }

    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    let ext = 'png';
    if (planFile.meta?.filename) {
      ext = planFile.meta.filename.split('.').pop() || 'png';
    } else if (planFile.meta?.mime === 'application/pdf') {
      ext = 'pdf';
    }

    const inputFilePath = path.join(jobDir, `input_plan.${ext}`);
    fs.writeFileSync(inputFilePath, buffer);

    this.logger.log(`[${offerId}] Spawning Python process...`);

    const pythonProjectRoot = path.resolve(process.cwd(), '../engine/new');
    if (!fs.existsSync(pythonProjectRoot)) {
      throw new Error(`Python root not found at ${pythonProjectRoot}`);
    }

    const venvCandidates = [
      path.join(pythonProjectRoot, 'runner', 'venv', 'bin', 'python'),
      path.join(pythonProjectRoot, 'runner', '.venv', 'bin', 'python'),
      path.join(pythonProjectRoot, 'venv', 'bin', 'python'),
      path.join(pythonProjectRoot, '.venv', 'bin', 'python'),
    ];

    let pythonCmd = 'python3';
    let foundVenv = false;

    for (const candidate of venvCandidates) {
      if (fs.existsSync(candidate)) {
        pythonCmd = candidate;
        this.logger.log(`[${offerId}] Using Virtual Env: ${candidate}`);
        foundVenv = true;
        break;
      }
    }

    if (!foundVenv) {
      this.logger.warn(`[${offerId}] No venv found. Using system '${pythonCmd}'.`);
    }

    // ✅ FOLOSIM ENV VAR pentru a evita limitările argv
const pythonProcess = spawn(
  pythonCmd,
  [
    '-m', 'runner.orchestrator', 
    inputFilePath, 
    '--job-id', offerId
  ],
  {
    cwd: pythonProjectRoot,
    env: { 
      ...process.env, 
      PYTHONUNBUFFERED: '1', 
      PYTHONPATH: pythonProjectRoot,
      FRONTEND_DATA_JSON: frontendDataJsonString  // ✅ CHEIA MAGICĂ!
    }
  }
);

this.logger.log(`[${offerId}] Spawning with ENV data (${frontendDataJsonString.length} chars)`);

    // =========================================================
    // ✅ ASCULTARE EVENIMENTE UI + SALVARE ÎN DB
    // =========================================================
    pythonProcess.stdout.on('data', async (data) => {
      const str = data.toString();
      console.log(`[PY-OUT ${offerId}]`, str.trim());

      if (str.includes('>>> UI:')) {
        const lines = str.split('\n');
        
        for (const line of lines) {
          if (!line.includes('>>> UI:')) continue;

          // Format: >>> UI:STAGE:nume|IMG:path
          const parts = line.split('|');
          let stage = '';
          let imgPath = '';

          const stagePart = parts.find(p => p.includes('UI:STAGE:'));
          if (stagePart) {
            stage = stagePart.split('UI:STAGE:')[1].trim();
          }

          const imgPart = parts.find(p => p.includes('IMG:'));
          if (imgPart) {
            imgPath = imgPart.split('IMG:')[1].trim();
          }

          if (!stage) continue;

          const payload: any = {};
          
          if (imgPath) {
            const uploadResult = await this.uploadFileToSupabase(offerId, imgPath);
            
            if (uploadResult) {
              const { publicUrl, storagePath } = uploadResult;
              const mimeType = mime.lookup(imgPath) || 'image/jpeg';

              payload.files = [{
                url: publicUrl,
                mime: mimeType,
                caption: path.basename(imgPath)
              }];

              // ✅ FIX CRITIC: Dacă e PDF-ul final, îl înregistrăm în offer_files
              // pentru ca ExportService să știe că acesta este output-ul, nu input-ul.
              if (stage === 'pdf_generation' || stage === 'computation_complete') {
                 if (mimeType === 'application/pdf' || imgPath.endsWith('.pdf')) {
                    console.log(`[${offerId}] Registering GENERATED PDF: ${storagePath}`);
                    
                    await supa.from('offer_files').insert({
                        tenant_id: tenantId,
                        offer_id: offerId,
                        storage_path: storagePath,
                        meta: { 
                            filename: path.basename(imgPath),
                            kind: 'offerPdf', // <--- Cheia magică pentru ExportService
                            mime: 'application/pdf',
                            size: fs.statSync(imgPath).size
                        }
                    });
                 }
              }
            }
          }

          const uiMessage = `[${stage}]`;

          try {
            await this.calcEvents.saveEvent(
              offerId,
              runId,
              uiMessage,
              payload,
              'info'
            );
            
            console.log(`📊 Event saved: [${stage}]`, imgPath || '');
          } catch (e) {
            console.error('❌ Error saving UI event:', e);
          }
        }
      }
    });

    pythonProcess.stderr.on('data', (d) => {
      console.error(`[PY-ERR ${offerId}]`, d.toString());
    });

    pythonProcess.on('close', (code) => {
      this.logger.log(`[${offerId}] Python exit code: ${code}`);
      
      if (code !== 0) {
        this.finishFail('engine', offerId, runId, { 
          message: `Exit code ${code}` 
        }).catch(() => {});
      }
    });
  }

  async finishOk(userId: string, offerId: string, run_id: string, result: any) {
    const tenantId = userId === 'engine' 
      ? await this.getTenantIdFromOffer(offerId) 
      : await this.getTenantIdFromProfile(userId);

    await this.assertOfferTenant(offerId, tenantId);

    await supa
      .from('offers')
      .update({ status: 'ready', result })
      .eq('id', offerId)
      .eq('tenant_id', tenantId);

    await supa
      .from('calc_runs')
      .update({ status: 'done', finished_at: new Date().toISOString() })
      .eq('id', run_id)
      .eq('tenant_id', tenantId);

    return { ok: true };
  }

  async finishFail(userId: string, offerId: string, run_id: string, errorObj: any) {
    const tenantId = userId === 'engine' 
      ? await this.getTenantIdFromOffer(offerId) 
      : await this.getTenantIdFromProfile(userId);

    try {
      await this.assertOfferTenant(offerId, tenantId);
    } catch {}

    await supa
      .from('offers')
      .update({ status: 'failed' })
      .eq('id', offerId)
      .eq('tenant_id', tenantId);

    await supa
      .from('calc_runs')
      .update({ status: 'failed', finished_at: new Date().toISOString() })
      .eq('id', run_id)
      .eq('tenant_id', tenantId);

    await this.calcEvents.saveEvent(
      offerId,
      run_id,
      errorObj?.message ?? 'failed',
      errorObj ?? null,
      'error'
    );

    return { ok: true };
  }

  async listEvents(userId: string, run_id: string, sinceId?: number, limit = 100) {
    const tenantId = await this.getTenantIdFromProfile(userId);

    const { data: run, error: runErr } = await supa
      .from('calc_runs')
      .select('id, tenant_id')
      .eq('id', run_id)
      .single();

    if (runErr || !run || run.tenant_id !== tenantId) {
      throw new NotFoundException('Run not found');
    }

    const q = supa
      .from('calc_events')
      .select('id, level, message, payload, created_at')
      .eq('run_id', run_id)
      .order('id', { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 500));

    if (sinceId) q.gt('id', sinceId);

    const { data, error } = await q;
    if (error) throw error;

    return { items: data ?? [] };
  }
}