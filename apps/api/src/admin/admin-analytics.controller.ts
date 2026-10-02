import { Controller, Get, Query } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

/** Converts a UTC timestamp column to its calendar day in India. */
const ist = (col: string) => Prisma.raw(`(${col} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date`);
const TODAY = Prisma.raw(`(now() AT TIME ZONE 'Asia/Kolkata')::date`);
const n = (v: bigint | number | null | undefined) => Number(v ?? 0);
const pct = (num: number, den: number) => (den ? Math.round((num / den) * 1000) / 10 : null);
const dayStr = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Closed-beta metrics: is the product understood, replayed, shared, and returned to?
 * Everything is computed from Postgres (users, sessions, analytics events) in IST days.
 */
@Roles(Role.ADMIN)
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@Query('days') daysParam = '30') {
    const days = Math.min(90, Math.max(7, Number(daysParam) || 30));
    const from = Prisma.raw(`((now() AT TIME ZONE 'Asia/Kolkata')::date - ${days - 1})`);
    const [daily, retention, funnel, games, acquisition] = await Promise.all([
      this.daily(from, days),
      this.retention(),
      this.funnel(from),
      this.perGame(from),
      this.acquisition(from),
    ]);
    return { days, daily, retention, funnel, games, acquisition };
  }

  private async daily(from: Prisma.Sql, days: number) {
    const [users, sessions, events] = await Promise.all([
      this.prisma.$queryRaw<{ d: Date; c: bigint }[]>`
        SELECT ${ist('"createdAt"')} AS d, COUNT(*) AS c FROM "User"
        WHERE ${ist('"createdAt"')} >= ${from} GROUP BY 1`,
      this.prisma.$queryRaw<{ d: Date; players: bigint; started: bigint; completed: bigint }[]>`
        SELECT ${ist('"startedAt"')} AS d, COUNT(DISTINCT "userId") AS players, COUNT(*) AS started,
               COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed
        FROM "GameSession" WHERE ${ist('"startedAt"')} >= ${from} GROUP BY 1`,
      this.prisma.$queryRaw<{ d: Date; name: string; c: bigint }[]>`
        SELECT ${ist('"createdAt"')} AS d, name, COUNT(*) AS c FROM "AnalyticsEvent"
        WHERE ${ist('"createdAt"')} >= ${from} AND name IN ('share_click', 'share_open', 'challenge_accept')
        GROUP BY 1, 2`,
    ]);
    const today = await this.prisma.$queryRaw<{ d: Date }[]>`SELECT ${TODAY} AS d`;
    const end = today[0].d;
    const series = Array.from({ length: days }, (_, i) => {
      const d = new Date(end.getTime() - (days - 1 - i) * 86_400_000);
      return { day: dayStr(d), newUsers: 0, players: 0, started: 0, completed: 0, shares: 0, shareOpens: 0, challengeAccepts: 0 };
    });
    const byDay = new Map(series.map((s) => [s.day, s]));
    for (const r of users) byDay.get(dayStr(r.d)) && (byDay.get(dayStr(r.d))!.newUsers = n(r.c));
    for (const r of sessions) {
      const row = byDay.get(dayStr(r.d));
      if (row) Object.assign(row, { players: n(r.players), started: n(r.started), completed: n(r.completed) });
    }
    const eventKey = { share_click: 'shares', share_open: 'shareOpens', challenge_accept: 'challengeAccepts' } as const;
    for (const r of events) {
      const row = byDay.get(dayStr(r.d));
      if (row) row[eventKey[r.name as keyof typeof eventKey]] = n(r.c);
    }
    return series;
  }

  /** Signup-day cohorts: share of each cohort that started a game exactly 1, 7 and 30 days later. */
  private async retention() {
    const rows = await this.prisma.$queryRaw<{ d0: Date; age: number; size: bigint; d1: bigint; d7: bigint; d30: bigint }[]>`
      WITH u AS (
        SELECT id, ${ist('"createdAt"')} AS d0 FROM "User"
        WHERE "createdAt" >= now() - interval '45 days'
      ),
      a AS (
        SELECT DISTINCT "userId", ${ist('"startedAt"')} AS d FROM "GameSession"
        WHERE "startedAt" >= now() - interval '80 days'
      )
      SELECT u.d0, (${TODAY} - u.d0) AS age, COUNT(*) AS size,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM a WHERE a."userId" = u.id AND a.d = u.d0 + 1)) AS d1,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM a WHERE a."userId" = u.id AND a.d = u.d0 + 7)) AS d7,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM a WHERE a."userId" = u.id AND a.d = u.d0 + 30)) AS d30
      FROM u GROUP BY u.d0 ORDER BY u.d0 DESC`;
    const overall = (k: 1 | 7 | 30) => {
      const eligible = rows.filter((r) => Number(r.age) >= k);
      const key = `d${k}` as const;
      return pct(
        eligible.reduce((s, r) => s + n(r[key]), 0),
        eligible.reduce((s, r) => s + n(r.size), 0),
      );
    };
    return {
      overall: { d1: overall(1), d7: overall(7), d30: overall(30) },
      cohorts: rows.slice(0, 14).map((r) => {
        const size = n(r.size);
        const age = Number(r.age);
        return {
          day: dayStr(r.d0),
          size,
          d1: age >= 1 ? pct(n(r.d1), size) : null,
          d7: age >= 7 ? pct(n(r.d7), size) : null,
          d30: age >= 30 ? pct(n(r.d30), size) : null,
        };
      }),
    };
  }

  private async funnel(from: Prisma.Sql) {
    const [r] = await this.prisma.$queryRaw<{ signed: bigint; onboarded: bigint; started: bigint; completed: bigint; shared: bigint }[]>`
      SELECT COUNT(*) AS signed,
        COUNT(*) FILTER (WHERE u."ageMode" IS NOT NULL) AS onboarded,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "GameSession" s WHERE s."userId" = u.id)) AS started,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "GameSession" s WHERE s."userId" = u.id AND s.status = 'COMPLETED')) AS completed,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "AnalyticsEvent" e WHERE e."userId" = u.id AND e.name = 'share_click')) AS shared
      FROM "User" u WHERE ${ist('u."createdAt"')} >= ${from}`;
    const steps = [
      ['Signed up', r.signed],
      ['Onboarded', r.onboarded],
      ['Started a game', r.started],
      ['Completed a game', r.completed],
      ['Shared a challenge', r.shared],
    ] as const;
    const top = n(r.signed);
    return steps.map(([label, v]) => ({ label, users: n(v), percent: pct(n(v), top) }));
  }

  private async perGame(from: Prisma.Sql) {
    const [stats, firsts, games] = await Promise.all([
      this.prisma.$queryRaw<
        { gameId: string; started: bigint; completed: bigint; players: bigint; repeaters: bigint; avgScore: number | null; avgMs: number | null }[]
      >`
        WITH s AS (SELECT * FROM "GameSession" WHERE ${ist('"startedAt"')} >= ${from}),
        per_player AS (SELECT "gameId", "userId", COUNT(*) AS c FROM s GROUP BY 1, 2)
        SELECT g."gameId",
          (SELECT COUNT(*) FROM s WHERE s."gameId" = g."gameId") AS started,
          (SELECT COUNT(*) FROM s WHERE s."gameId" = g."gameId" AND s.status = 'COMPLETED') AS completed,
          COUNT(*) AS players,
          COUNT(*) FILTER (WHERE g.c >= 2) AS repeaters,
          (SELECT AVG(score)::float FROM s WHERE s."gameId" = g."gameId" AND s.status = 'COMPLETED') AS "avgScore",
          (SELECT AVG("durationMs")::float FROM s WHERE s."gameId" = g."gameId" AND s.status = 'COMPLETED') AS "avgMs"
        FROM per_player g GROUP BY g."gameId"`,
      // Retention of players by the first game they ever played (all time, not just this window).
      this.prisma.$queryRaw<{ gameId: string; e1: bigint; r1: bigint; e7: bigint; r7: bigint }[]>`
        WITH firsts AS (
          SELECT DISTINCT ON ("userId") "userId", "gameId", ${ist('"startedAt"')} AS d
          FROM "GameSession" ORDER BY "userId", "startedAt"
        ),
        a AS (SELECT DISTINCT "userId", ${ist('"startedAt"')} AS d FROM "GameSession")
        SELECT f."gameId",
          COUNT(*) FILTER (WHERE f.d <= ${TODAY} - 1) AS e1,
          COUNT(*) FILTER (WHERE f.d <= ${TODAY} - 1 AND EXISTS (SELECT 1 FROM a WHERE a."userId" = f."userId" AND a.d = f.d + 1)) AS r1,
          COUNT(*) FILTER (WHERE f.d <= ${TODAY} - 7) AS e7,
          COUNT(*) FILTER (WHERE f.d <= ${TODAY} - 7 AND EXISTS (SELECT 1 FROM a WHERE a."userId" = f."userId" AND a.d = f.d + 7)) AS r7
        FROM firsts f GROUP BY f."gameId"`,
      this.prisma.game.findMany({ select: { id: true, slug: true, name: true }, orderBy: { sortOrder: 'asc' } }),
    ]);
    const s = new Map(stats.map((r) => [r.gameId, r]));
    const f = new Map(firsts.map((r) => [r.gameId, r]));
    return games.map((g) => {
      const st = s.get(g.id);
      const fr = f.get(g.id);
      const started = n(st?.started);
      const players = n(st?.players);
      return {
        game: g,
        started,
        completed: n(st?.completed),
        completionRate: pct(n(st?.completed), started),
        players,
        repeatPlayerRate: pct(n(st?.repeaters), players),
        avgScore: st?.avgScore == null ? null : Math.round(st.avgScore),
        avgDurationSec: st?.avgMs == null ? null : Math.round(st.avgMs / 1000),
        firstGameD1: pct(n(fr?.r1), n(fr?.e1)),
        firstGameD7: pct(n(fr?.r7), n(fr?.e7)),
        firstGamePlayers: n(fr?.e1),
      };
    });
  }

  private async acquisition(from: Prisma.Sql) {
    const window = Prisma.sql`${ist('u."createdAt"')} >= ${from}`;
    const [byInvite, byUtm, [totals], [viral]] = await Promise.all([
      this.prisma.$queryRaw<{ code: string; label: string; signups: bigint }[]>`
        SELECT i.code, i.label, COUNT(*) AS signups FROM "User" u JOIN "InviteCode" i ON i.id = u."inviteCodeId"
        WHERE ${window} GROUP BY 1, 2 ORDER BY 3 DESC`,
      this.prisma.$queryRaw<{ source: string; campaign: string | null; signups: bigint }[]>`
        SELECT u."utmSource" AS source, u."utmCampaign" AS campaign, COUNT(*) AS signups FROM "User" u
        WHERE ${window} AND u."utmSource" IS NOT NULL GROUP BY 1, 2 ORDER BY 3 DESC`,
      this.prisma.$queryRaw<{ total: bigint; invite: bigint; challenge: bigint; utm: bigint }[]>`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE u."inviteCodeId" IS NOT NULL) AS invite,
          COUNT(*) FILTER (WHERE u."referredBySessionId" IS NOT NULL) AS challenge,
          COUNT(*) FILTER (WHERE u."utmSource" IS NOT NULL) AS utm
        FROM "User" u WHERE ${window}`,
      this.prisma.$queryRaw<{ shares: bigint; opens: bigint; accepts: bigint }[]>`
        SELECT COUNT(*) FILTER (WHERE name = 'share_click') AS shares,
               COUNT(*) FILTER (WHERE name = 'share_open') AS opens,
               COUNT(*) FILTER (WHERE name = 'challenge_accept') AS accepts
        FROM "AnalyticsEvent" WHERE ${ist('"createdAt"')} >= ${from}`,
    ]);
    const challengeSignups = n(totals.challenge);
    return {
      signups: n(totals.total),
      viaInvite: n(totals.invite),
      viaChallenge: challengeSignups,
      viaUtm: n(totals.utm),
      byInvite: byInvite.map((r) => ({ code: r.code, label: r.label, signups: n(r.signups) })),
      byUtm: byUtm.map((r) => ({ source: r.source, campaign: r.campaign, signups: n(r.signups) })),
      viral: {
        shares: n(viral.shares),
        opens: n(viral.opens),
        accepts: n(viral.accepts),
        signups: challengeSignups,
        /** New signups per challenge shared. */
        signupsPerShare: n(viral.shares) ? Math.round((challengeSignups / n(viral.shares)) * 100) / 100 : null,
      },
    };
  }
}
