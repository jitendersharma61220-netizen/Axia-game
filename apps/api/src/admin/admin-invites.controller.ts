import { Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { Prisma, Role, type User } from '@prisma/client';
import { CurrentUser, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { CreateInviteDto, UpdateInviteDto } from './dto';

@Roles(Role.ADMIN)
@Controller('admin/invites')
export class AdminInvitesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list() {
    const codes = await this.prisma.inviteCode.findMany({ orderBy: { createdAt: 'desc' } });
    // Signups per code that have gone on to complete at least one game ("activated").
    const activated = await this.prisma.$queryRaw<{ inviteCodeId: string; n: bigint }[]>`
      SELECT u."inviteCodeId", COUNT(DISTINCT u.id) AS n
      FROM "User" u JOIN "GameSession" s ON s."userId" = u.id AND s.status = 'COMPLETED'
      WHERE u."inviteCodeId" IS NOT NULL
      GROUP BY u."inviteCodeId"`;
    const byCode = new Map(activated.map((r) => [r.inviteCodeId, Number(r.n)]));
    return codes.map((c) => ({ ...c, activated: byCode.get(c.id) ?? 0 }));
  }

  @Post()
  async create(@CurrentUser() actor: User, @Body() dto: CreateInviteDto) {
    try {
      const invite = await this.prisma.inviteCode.create({
        data: {
          code: dto.code.toUpperCase(),
          label: dto.label,
          maxUses: dto.maxUses ?? null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          createdById: actor.id,
        },
      });
      await this.audit.log(actor.id, 'create', 'invite', invite.id, undefined, invite);
      return invite;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('That code already exists');
      }
      throw err;
    }
  }

  @Patch(':id')
  async update(@CurrentUser() actor: User, @Param('id') id: string, @Body() dto: UpdateInviteDto) {
    const before = await this.prisma.inviteCode.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Invite code not found');
    const after = await this.prisma.inviteCode.update({
      where: { id },
      data: {
        label: dto.label,
        active: dto.active,
        maxUses: dto.maxUses === undefined ? undefined : dto.maxUses,
        expiresAt: dto.expiresAt === undefined ? undefined : dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
    await this.audit.log(actor.id, 'update', 'invite', id, before, after);
    return after;
  }
}
