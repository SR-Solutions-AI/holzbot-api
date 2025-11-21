import { Controller, Post, Body, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// ✅ FOLOSIM ACELAȘI BUCKET CA ÎN FILES.SERVICE
const BUCKET = process.env.SUPABASE_BUCKET || 'house-plans';

@Controller('validate-plan')
export class ValidatePlanController {
  private openai: OpenAI;
  private supabase;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  @Post()
  async validate(@Body() body: { fileUrl?: string; storagePath?: string; mimeType: string }, @Res() res: Response) {
    try {
      let { fileUrl } = body;
      const { storagePath, mimeType } = body;

      console.log(`🔍 Validate Request: Path=${storagePath}, Mime=${mimeType}, Bucket=${BUCKET}`);

      // 1. Generăm URL semnat dacă avem doar calea
      if (!fileUrl && storagePath) {
        const { data, error } = await this.supabase
          .storage
          .from(BUCKET) // <--- AICI ERA PROBLEMA (acum e 'house-plans')
          .createSignedUrl(storagePath, 60); 

        if (error || !data?.signedUrl) {
          console.error("❌ Failed to generate Signed URL:", error);
        } else {
          fileUrl = data.signedUrl;
          console.log("✅ Signed URL generated successfully.");
        }
      }

      // 2. Validări de bază
      if (!fileUrl) {
        return res.status(HttpStatus.OK).json({ valid: true, reason: 'No URL available (Fail Open)' });
      }

      const isImage = mimeType?.startsWith('image/');
      if (!isImage) {
        console.log("ℹ️ File is PDF/Other. Skipping AI vision.");
        return res.status(HttpStatus.OK).json({ valid: true, reason: 'Format accepted implicitly' });
      }

      // 3. Apel către OpenAI Vision
      console.log(`🤖 Asking OpenAI Vision...`);
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert architect assistant. 
            Your job is to validate if an uploaded image is a usable floor plan.
            Check for AT LEAST ONE:
            1. Room labels (Living, Kitchen, Zimmer, Bad).
            2. Dimensions/Areas (numbers with m² or cm).
            3. Scale bar or graphical lines representing walls.
            
            If it's just a photo of a building exterior or completely blurry/blank, valid=false.
            
            Return JSON: { "valid": boolean, "reason": "short string" }`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this floor plan." },
              { type: "image_url", image_url: { url: fileUrl, detail: "high" } },
            ],
          },
        ],
        max_tokens: 300,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content;
      if (!content) throw new Error("No AI response");

      const result = JSON.parse(content);
      console.log(`✅ OpenAI Verdict:`, result);
      
      return res.status(HttpStatus.OK).json(result);

    } catch (error: any) {
      console.error('❌ AI Validation Exception:', error.message);
      return res.status(HttpStatus.OK).json({ valid: true, reason: 'Validation skipped due to error' });
    }
  }
}