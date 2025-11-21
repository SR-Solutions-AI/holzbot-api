import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as jose from 'jose';

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    const token = auth.substring('Bearer '.length);

    try {
      const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);
      // Nu mai impunem issuer; punem aud = 'authenticated'
      const { payload } = await jose.jwtVerify(token, secret, {
        algorithms: ['HS256'],
        audience: 'authenticated',
        // issuer: `https://${process.env.SUPABASE_URL!.replace(/^https?:\/\//,'')}/auth/v1`, // opțional, dacă vrei să îl impui corect
      });

      req.user = {
        id: payload.sub as string,
        email: (payload as any).email ?? null,
        role: (payload as any).role ?? 'authenticated',
      };
      return true;
    } catch (e) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
