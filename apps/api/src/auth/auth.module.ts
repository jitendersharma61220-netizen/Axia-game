import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, type User } from '@prisma/client';
import type { Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { config } from '../config';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { toPublicUser } from '../users/users.module';

const TOKEN_TTL_DAYS = 30;

interface Identity {
  email: string;
  name: string;
  avatarUrl?: string;
  googleSub?: string;
}

@Injectable()
export class AuthService {
  private readonly google = new OAuth2Client();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly analytics: AnalyticsService,
  ) {}

  async verifyGoogleToken(idToken: string): Promise<Identity> {
    if (!config.googleClientId) throw new UnauthorizedException('Google sign-in is not configured');
    try {
      const ticket = await this.google.verifyIdToken({ idToken, audience: config.googleClientId });
      const p = ticket.getPayload();
      if (!p?.email || !p.email_verified) throw new Error('Email not verified');
      return { email: p.email.toLowerCase(), name: p.name ?? p.email, avatarUrl: p.picture, googleSub: p.sub };
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  async upsertUser(identity: Identity): Promise<{ user: User; isNew: boolean }> {
    const existing = await this.prisma.user.findUnique({ where: { email: identity.email } });
    const shouldBeAdmin = config.adminEmails.includes(identity.email);
    if (existing) {
      if (existing.banned) throw new ForbiddenException('This account is suspended');
      const user = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          googleSub: identity.googleSub ?? existing.googleSub,
          avatarUrl: identity.avatarUrl ?? existing.avatarUrl,
          ...(shouldBeAdmin && { role: Role.ADMIN }),
        },
      });
      return { user, isNew: false };
    }
    const user = await this.prisma.user.create({
      data: { ...identity, role: shouldBeAdmin ? Role.ADMIN : Role.USER },
    });
    this.analytics.track('signup', user.id, { method: identity.googleSub ? 'google' : 'dev' });
    return { user, isNew: true };
  }

  async signIn(res: Response, identity: Identity) {
    const { user, isNew } = await this.upsertUser(identity);
    const token = await this.jwt.signAsync({ sub: user.id }, { expiresIn: `${TOKEN_TTL_DAYS}d` });
    res.cookie(config.authCookie, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: TOKEN_TTL_DAYS * 86_400_000,
      path: '/',
    });
    this.analytics.track('login', user.id);
    return { user: toPublicUser(user), isNew };
  }
}

class GoogleLoginDto {
  @IsString()
  idToken: string;
}

class DevLoginDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('google')
  @HttpCode(200)
  async google(@Body() dto: GoogleLoginDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.signIn(res, await this.auth.verifyGoogleToken(dto.idToken));
  }

  /** Local development only: sign in as any email without Google. */
  @Public()
  @Post('dev-login')
  @HttpCode(200)
  async devLogin(@Body() dto: DevLoginDto, @Res({ passthrough: true }) res: Response) {
    if (!config.allowDevLogin) throw new NotFoundException();
    const email = dto.email.toLowerCase();
    return this.auth.signIn(res, { email, name: dto.name ?? email.split('@')[0] });
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(config.authCookie, { path: '/' });
    return { ok: true };
  }
}

@Module({
  imports: [],
  providers: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
