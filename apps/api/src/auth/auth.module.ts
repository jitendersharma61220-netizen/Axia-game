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
import { Role, SessionStatus, type User } from '@prisma/client';
import type { Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { config } from '../config';
import { Public } from '../common/decorators';
import { RateLimit } from '../common/rate-limit';
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

  async upsertUser(identity: Identity, attribution: Attribution = {}): Promise<{ user: User; isNew: boolean }> {
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

    const user = await this.prisma.$transaction(async (tx) => {
      const ref = attribution.ref
        ? await tx.gameSession.findFirst({ where: { id: attribution.ref, status: SessionStatus.COMPLETED }, select: { id: true } })
        : null;
      let inviteCodeId: string | null = null;
      if (attribution.inviteCode) {
        const code = await tx.inviteCode.findUnique({ where: { code: attribution.inviteCode.trim().toUpperCase() } });
        const usable = code && code.active && (!code.expiresAt || code.expiresAt > new Date());
        if (usable) {
          // Conditional increment: concurrent signups can never push a code past maxUses.
          const { count } = await tx.inviteCode.updateMany({
            where: { id: code.id, ...(code.maxUses !== null && { uses: { lt: code.maxUses } }) },
            data: { uses: { increment: 1 } },
          });
          if (count) inviteCodeId = code.id;
          else if (!ref && !shouldBeAdmin && config.signupMode === 'invite') {
            throw new ForbiddenException({ code: 'INVITE_EXHAUSTED', message: 'This invite code has been fully used.' });
          }
        }
      }
      if (config.signupMode === 'invite' && !inviteCodeId && !ref && !shouldBeAdmin) {
        if (attribution.inviteCode) {
          throw new ForbiddenException({ code: 'INVITE_INVALID', message: 'That invite code is not valid or has expired.' });
        }
        throw new ForbiddenException({
          code: 'INVITE_REQUIRED',
          message: 'Axia is in closed beta. You need a valid invite code or a friend’s challenge link to join.',
        });
      }
      return tx.user.create({
        data: {
          ...identity,
          role: shouldBeAdmin ? Role.ADMIN : Role.USER,
          inviteCodeId,
          referredBySessionId: ref?.id ?? null,
          utmSource: attribution.utmSource?.slice(0, 100),
          utmMedium: attribution.utmMedium?.slice(0, 100),
          utmCampaign: attribution.utmCampaign?.slice(0, 100),
        },
      });
    });
    this.analytics.track('signup', user.id, {
      method: identity.googleSub ? 'google' : 'dev',
      inviteCodeId: user.inviteCodeId,
      viaChallenge: !!user.referredBySessionId,
      utmSource: user.utmSource,
    });
    return { user, isNew: true };
  }

  async signIn(res: Response, identity: Identity, attribution: Attribution = {}) {
    const { user, isNew } = await this.upsertUser(identity, attribution);
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

/** First-touch attribution sent with sign-in; only used when a new account is created. */
class Attribution {
  @IsOptional() @IsString() @MaxLength(40)
  inviteCode?: string;

  /** Session id from a friend's challenge link. */
  @IsOptional() @IsString() @MaxLength(40)
  ref?: string;

  @IsOptional() @IsString() @MaxLength(200)
  utmSource?: string;

  @IsOptional() @IsString() @MaxLength(200)
  utmMedium?: string;

  @IsOptional() @IsString() @MaxLength(200)
  utmCampaign?: string;
}

class GoogleLoginDto extends Attribution {
  @IsString()
  idToken: string;
}

class DevLoginDto extends Attribution {
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
  @RateLimit({ key: 'auth', limit: 60, windowSeconds: 60 })
  @Post('google')
  @HttpCode(200)
  async google(@Body() dto: GoogleLoginDto, @Res({ passthrough: true }) res: Response) {
    const { idToken, ...attribution } = dto;
    return this.auth.signIn(res, await this.auth.verifyGoogleToken(idToken), attribution);
  }

  /** Local development only: sign in as any email without Google. */
  @Public()
  @RateLimit({ key: 'auth', limit: 60, windowSeconds: 60 })
  @Post('dev-login')
  @HttpCode(200)
  async devLogin(@Body() dto: DevLoginDto, @Res({ passthrough: true }) res: Response) {
    if (!config.allowDevLogin) throw new NotFoundException();
    const { email: rawEmail, name, ...attribution } = dto;
    const email = rawEmail.toLowerCase();
    return this.auth.signIn(res, { email, name: name ?? email.split('@')[0] }, attribution);
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
