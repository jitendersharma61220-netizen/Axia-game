import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(actorId: string, action: string, entity: string, entityId: string, before?: unknown, after?: unknown) {
    return this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        entity,
        entityId,
        before: toJson(before),
        after: toJson(after),
      },
    });
  }
}

function toJson(v: unknown): Prisma.InputJsonValue | undefined {
  return v === undefined || v === null ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);
}
