/** Idempotent seed: the first game, its difficulty presets, today's challenges and a dev admin. */
import { AgeMode, ChallengeType, GameStatus, PrismaClient, Role } from '@prisma/client';
import {
  digitalDetective,
  internetCafeMission,
  memoryReconstruction,
  neuralBoss,
  ruleShift,
  validateParams,
} from '@axia/engine';

const prisma = new PrismaClient();

const IST = '+05:30';
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

interface SeedGame {
  slug: string;
  template: { key: string; name: string; description: string };
  estMinutes: number;
  sortOrder: number;
  presets: { key: string; label: string; isDefault?: boolean; params: Record<string, unknown> }[];
}

const games: SeedGame[] = [
  {
    slug: 'memory-reconstruction',
    template: memoryReconstruction,
    estMinutes: 7,
    sortOrder: 3,
    presets: [
      { key: 'easy', label: 'Easy', params: { gridRows: 3, gridCols: 3, objectCount: 3, distractorCount: 1, showDurationMs: 5000, recallTimeLimitMs: 30000, rounds: 3 } },
      { key: 'medium', label: 'Medium', isDefault: true, params: { gridRows: 4, gridCols: 4, objectCount: 5, distractorCount: 2, showDurationMs: 4000, recallTimeLimitMs: 30000, rounds: 3 } },
      { key: 'hard', label: 'Hard', params: { gridRows: 5, gridCols: 5, objectCount: 8, distractorCount: 4, showDurationMs: 3500, recallTimeLimitMs: 40000, rounds: 4 } },
    ],
  },
  {
    slug: 'rule-shift',
    template: ruleShift,
    estMinutes: 6,
    sortOrder: 4,
    presets: [
      { key: 'easy', label: 'Easy', params: { trials: 20, minRun: 5, maxRun: 8, rules: ['color', 'shape'], showRuleHint: true, trialTimeLimitMs: 6000 } },
      { key: 'medium', label: 'Medium', isDefault: true, params: { trials: 30, minRun: 4, maxRun: 7, showRuleHint: false, trialTimeLimitMs: 5000 } },
      { key: 'hard', label: 'Hard', params: { trials: 40, minRun: 3, maxRun: 5, showRuleHint: false, trialTimeLimitMs: 3500 } },
    ],
  },
  {
    slug: 'digital-detective',
    template: digitalDetective,
    estMinutes: 12,
    sortOrder: 2,
    presets: [
      { key: 'easy', label: 'Easy', params: { cases: 3, suspects: 3, attributeCount: 2, negativeClueRatio: 0, redHerrings: 0, caseTimeLimitMs: 120000 } },
      { key: 'medium', label: 'Medium', isDefault: true, params: { cases: 4, suspects: 5, attributeCount: 3, negativeClueRatio: 0.3, redHerrings: 1, caseTimeLimitMs: 150000 } },
      { key: 'hard', label: 'Hard', params: { cases: 5, suspects: 7, attributeCount: 4, negativeClueRatio: 0.6, redHerrings: 2, caseTimeLimitMs: 180000 } },
    ],
  },
  {
    slug: 'neural-boss',
    template: neuralBoss,
    estMinutes: 8,
    sortOrder: 5,
    presets: [
      { key: 'easy', label: 'Easy', params: { bossHp: 80, playerHp: 5, damagePerHit: 10, questionTimeMs: 9000, phaseSpeedup: 0.1, maxQuestions: 25, numberMax: 12 } },
      { key: 'medium', label: 'Medium', isDefault: true, params: { bossHp: 120, playerHp: 3, damagePerHit: 10, questionTimeMs: 7000, phaseSpeedup: 0.2, maxQuestions: 30, numberMax: 25 } },
      { key: 'hard', label: 'Hard', params: { bossHp: 200, playerHp: 3, damagePerHit: 10, questionTimeMs: 5500, phaseSpeedup: 0.3, maxQuestions: 40, numberMax: 50 } },
    ],
  },
  {
    slug: 'internet-cafe-mission',
    template: internetCafeMission,
    estMinutes: 20,
    sortOrder: 1,
    presets: [
      { key: 'easy', label: 'Easy', params: { stages: 5, stageTimeLimitMs: 60000, captchaGrid: 3, captchaTargets: 3, sequenceLength: 4, billItems: 2, folderDepth: 1, folderBreadth: 3, passwordLength: 4, noteShowMs: 6000 } },
      { key: 'medium', label: 'Medium', isDefault: true, params: { stages: 8, stageTimeLimitMs: 45000, captchaGrid: 4, captchaTargets: 4, sequenceLength: 5, billItems: 3, folderDepth: 2, folderBreadth: 3, passwordLength: 5, noteShowMs: 5000 } },
      { key: 'hard', label: 'Hard', params: { stages: 12, stageTimeLimitMs: 40000, captchaGrid: 5, captchaTargets: 6, sequenceLength: 7, sequenceShowMs: 550, billItems: 4, folderDepth: 3, folderBreadth: 4, passwordLength: 6, noteShowMs: 4000 } },
    ],
  },
];

async function main() {
  for (const g of games) {
    const row = await prisma.game.upsert({
      where: { slug: g.slug },
      update: {},
      create: {
        slug: g.slug,
        name: g.template.name,
        description: g.template.description,
        templateKey: g.template.key,
        status: GameStatus.LIVE,
        ageModes: [AgeMode.ADULT, AgeMode.TEEN],
        estMinutes: g.estMinutes,
        sortOrder: g.sortOrder,
        attemptsPerDay: 5,
      },
    });
    for (const [i, p] of g.presets.entries()) {
      const v = validateParams(row.templateKey, p.params);
      if (!v.ok) throw new Error(`Seed preset ${g.slug}/${p.key} invalid: ${JSON.stringify(v.errors)}`);
      await prisma.difficultyPreset.upsert({
        where: { gameId_key: { gameId: row.id, key: p.key } },
        update: {},
        create: { gameId: row.id, key: p.key, label: p.label, sortOrder: i + 1, isDefault: p.isDefault ?? false, params: v.params as object },
      });
    }
  }

  const game = await prisma.game.findUniqueOrThrow({ where: { slug: 'memory-reconstruction' } });
  const medium = await prisma.difficultyPreset.findUniqueOrThrow({ where: { gameId_key: { gameId: game.id, key: 'medium' } } });
  const hard = await prisma.difficultyPreset.findUniqueOrThrow({ where: { gameId_key: { gameId: game.id, key: 'hard' } } });

  const day = todayIST();
  const dayStart = new Date(`${day}T00:00:00${IST}`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const daily = await prisma.challenge.findFirst({ where: { gameId: game.id, type: ChallengeType.DAILY, startsAt: dayStart } });
  if (!daily) {
    await prisma.challenge.create({
      data: {
        gameId: game.id,
        presetId: medium.id,
        type: ChallengeType.DAILY,
        title: `Daily Memory · ${day}`,
        seed: `daily-${day}`,
        startsAt: dayStart,
        endsAt: dayEnd,
      },
    });
  }

  // Week runs Monday 00:00 → next Monday 00:00 IST.
  const dow = (new Date(`${day}T12:00:00${IST}`).getUTCDay() + 6) % 7;
  const weekStart = new Date(dayStart.getTime() - dow * 86_400_000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
  const weekly = await prisma.challenge.findFirst({ where: { gameId: game.id, type: ChallengeType.WEEKLY, startsAt: weekStart } });
  if (!weekly) {
    await prisma.challenge.create({
      data: {
        gameId: game.id,
        presetId: hard.id,
        type: ChallengeType.WEEKLY,
        title: 'Weekly Memory Marathon',
        seed: `weekly-${weekStart.toISOString().slice(0, 10)}`,
        startsAt: weekStart,
        endsAt: weekEnd,
      },
    });
  }

  await prisma.user.upsert({
    where: { email: 'admin@axia.local' },
    update: { role: Role.ADMIN },
    create: { email: 'admin@axia.local', name: 'Axia Admin', role: Role.ADMIN, birthYear: 1995, ageMode: AgeMode.ADULT },
  });

  console.log(`Seeded: ${games.map((g) => g.slug).join(', ')} (easy/medium/hard each), daily + weekly challenge, admin@axia.local`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
