/** Idempotent seed: the first game, its difficulty presets, today's challenges and a dev admin. */
import { AgeMode, ChallengeType, GameStatus, PrismaClient, Role } from '@prisma/client';
import { memoryReconstruction, validateParams } from '@axia/engine';

const prisma = new PrismaClient();

const IST = '+05:30';
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

const presets = [
  {
    key: 'easy',
    label: 'Easy',
    sortOrder: 1,
    params: { gridRows: 3, gridCols: 3, objectCount: 3, distractorCount: 1, showDurationMs: 5000, recallTimeLimitMs: 30000, rounds: 3 },
  },
  {
    key: 'medium',
    label: 'Medium',
    sortOrder: 2,
    isDefault: true,
    params: { gridRows: 4, gridCols: 4, objectCount: 5, distractorCount: 2, showDurationMs: 4000, recallTimeLimitMs: 30000, rounds: 3 },
  },
  {
    key: 'hard',
    label: 'Hard',
    sortOrder: 3,
    params: { gridRows: 5, gridCols: 5, objectCount: 8, distractorCount: 4, showDurationMs: 3500, recallTimeLimitMs: 40000, rounds: 4 },
  },
];

async function main() {
  const game = await prisma.game.upsert({
    where: { slug: 'memory-reconstruction' },
    update: {},
    create: {
      slug: 'memory-reconstruction',
      name: memoryReconstruction.name,
      description: memoryReconstruction.description,
      templateKey: memoryReconstruction.key,
      status: GameStatus.LIVE,
      ageModes: [AgeMode.ADULT, AgeMode.TEEN],
      estMinutes: 7,
      attemptsPerDay: 5,
    },
  });

  for (const p of presets) {
    const v = validateParams(game.templateKey, p.params);
    if (!v.ok) throw new Error(`Seed preset ${p.key} invalid: ${JSON.stringify(v.errors)}`);
    await prisma.difficultyPreset.upsert({
      where: { gameId_key: { gameId: game.id, key: p.key } },
      update: {},
      create: { gameId: game.id, key: p.key, label: p.label, sortOrder: p.sortOrder, isDefault: p.isDefault ?? false, params: v.params as object },
    });
  }

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

  console.log('Seeded: memory-reconstruction (easy/medium/hard), daily + weekly challenge, admin@axia.local');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
