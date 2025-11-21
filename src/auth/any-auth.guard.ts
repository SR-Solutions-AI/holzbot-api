// apps/api/src/auth/any-auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseJwtGuard } from './supabase.guard';

function getHeaderString(h: string | string[] | undefined): string | undefined {
  if (Array.isArray(h)) return h[0];
  return typeof h === 'string' ? h : undefined;
}

@Injectable()
export class AnyAuthGuard implements CanActivate {
  private supa = new SupabaseJwtGuard();

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();

    // 1) Încearcă Supabase JWT (frontend)
    try {
      if (await this.supa.canActivate(ctx)) return true;
    } catch {
      // ignorăm; încercăm engine mai jos
    }

    // 2) Engine secret (server-to-server)
    const configuredSecret = process.env.ENGINE_SECRET;
    const xEngine = getHeaderString(req.headers['x-engine-secret']);
    const auth = getHeaderString(req.headers['authorization']);

    const authIsEngine =
      !!configuredSecret &&
      (
        (xEngine && xEngine === configuredSecret) ||
        (auth && auth.toLowerCase().startsWith('engine ') && auth.slice(7) === configuredSecret)
      );

    if (authIsEngine) {
      req.user = req.user || {};
      req.user.id = 'engine';
      req.user.role = 'engine';
      return true;
    }

    // 3) Nimic valid -> 401
    throw new UnauthorizedException('Missing or invalid authentication');
  }
}
