import { Controller, Post, Body, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import * as path from 'path'; // <--- Asigură-te că ai acest import

const BUCKET = process.env.SUPABASE_BUCKET || 'house-plans';

@Controller('validate-plan')
export class ValidatePlanController {
  private supabase;
  private pythonScriptPath: string;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // --- LOGICA NOUĂ DE CALE ---
    // 1. Încercăm să luăm din ENV (pentru override manual dacă e nevoie)
    if (process.env.VALIDATOR_SCRIPT_PATH) {
      this.pythonScriptPath = process.env.VALIDATOR_SCRIPT_PATH;
    } else {
      // 2. Calculăm automat: "../engine/validator.py" față de rădăcina proiectului API
      // process.cwd() returnează folderul unde e package.json al API-ului
      this.pythonScriptPath = path.resolve(process.cwd(), '../engine/validator.py');
    }
    
    console.log(`📍 Python Script Path set to: ${this.pythonScriptPath}`);
  }

  @Post()
  async validate(@Body() body: { fileUrl?: string; storagePath?: string; mimeType: string }, @Res() res: Response) {
    try {
      let { fileUrl } = body;
      const { storagePath, mimeType } = body;

      console.log(`🔍 Validate Request: Path=${storagePath}, Mime=${mimeType}`);

      // ... (Restul codului pentru Signed URL rămâne la fel) ...
      if (!fileUrl && storagePath) {
         const { data, error } = await this.supabase
          .storage
          .from(BUCKET)
          .createSignedUrl(storagePath, 60);
         if (!error && data?.signedUrl) fileUrl = data.signedUrl;
      }

      if (!fileUrl) {
        return res.status(HttpStatus.BAD_REQUEST).json({ valid: false, reason: 'No URL provided' });
      }

      // Folosim variabila din clasă 'this.pythonScriptPath'
      // ATENȚIE: Pe VPS s-ar putea să trebuiască să pui 'python3' sau calea către venv
      const pythonCmd = process.env.PYTHON_CMD || 'python3'; 
      
      console.log(`🐍 Spawning: ${pythonCmd} ${this.pythonScriptPath}`);

      const pythonProcess = spawn(pythonCmd, [this.pythonScriptPath, fileUrl]);

      let resultData = '';
      let errorData = '';

      pythonProcess.stdout.on('data', (data) => { resultData += data.toString(); });
      pythonProcess.stderr.on('data', (data) => { errorData += data.toString(); });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`❌ Python Validator Failed (Exit ${code}):`, errorData);
          // Dacă nu găsește fișierul, errorData va conține mesajul relevant
          return res.status(HttpStatus.OK).json({ valid: true, reason: 'Script error (Fail Open)' });
        }
        
        try {
            const lines = resultData.trim().split('\n');
            const jsonStr = lines[lines.length - 1];
            const result = JSON.parse(jsonStr);
            console.log(`✅ Validator Result:`, result);
            return res.status(HttpStatus.OK).json(result);
        } catch (e) {
            return res.status(HttpStatus.OK).json({ valid: true, reason: 'Parse error' });
        }
      });

    } catch (error: any) {
      console.error('❌ Validation Exception:', error.message);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ valid: true, reason: 'Internal error' });
    }
  }
}