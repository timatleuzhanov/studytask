import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

const POINTS_PER_STAR = 10;
const MAX_ATTEMPTS_PER_DAY = 10;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

router.get("/today", requireRole(Role.STUDENT), async (req, res) => {
  const day = startOfDay(new Date());
  const tomorrow = new Date(day);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const attemptsToday = await prisma.miniGameAttempt.count({
    where: {
      userId: req.userId!,
      createdAt: { gte: day, lt: tomorrow },
    },
  });

  const best = await prisma.miniGameBest.findUnique({
    where: { userId: req.userId! },
  });

  res.json({
    attemptsUsedToday: attemptsToday,
    attemptsLeftToday: Math.max(0, MAX_ATTEMPTS_PER_DAY - attemptsToday),
    bestScore: best?.bestScore ?? 0,
    pointsPerStar: POINTS_PER_STAR,
  });
});

const finishSchema = z.object({
  /** Очки за текущую сессию (клиент после раунда) */
  sessionPoints: z.number().int().min(0),
});

router.post(
  "/finish",
  requireRole(Role.STUDENT),
  async (req, res) => {
    const parsed = finishSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Нужен sessionPoints" });
      return;
    }
    const { sessionPoints } = parsed.data;

    const day = startOfDay(new Date());
    const tomorrow = new Date(day);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attemptsToday = await prisma.miniGameAttempt.count({
      where: {
        userId: req.userId!,
        createdAt: { gte: day, lt: tomorrow },
      },
    });
    if (attemptsToday >= MAX_ATTEMPTS_PER_DAY) {
      res.status(429).json({ error: "Лимит 10 попыток в день" });
      return;
    }

    const starsEarned = Math.floor(sessionPoints / POINTS_PER_STAR);

    const result = await prisma.$transaction(async (tx) => {
      await tx.miniGameAttempt.create({
        data: {
          userId: req.userId!,
          scorePoints: sessionPoints,
          starsEarned,
        },
      });

      const prev = await tx.miniGameBest.findUnique({
        where: { userId: req.userId! },
      });
      const newBest = Math.max(prev?.bestScore ?? 0, sessionPoints);
      await tx.miniGameBest.upsert({
        where: { userId: req.userId! },
        create: { userId: req.userId!, bestScore: newBest },
        update: { bestScore: newBest },
      });

      if (starsEarned > 0) {
        await tx.user.update({
          where: { id: req.userId! },
          data: { starsTotal: { increment: starsEarned } },
        });
        await tx.starLedger.create({
          data: {
            userId: req.userId!,
            delta: starsEarned,
            reason: "Мини-игра",
            refType: "MINI_GAME",
          },
        });
      }

      const user = await tx.user.findUnique({
        where: { id: req.userId! },
        select: { starsTotal: true },
      });
      return { starsTotal: user?.starsTotal ?? 0, bestScore: newBest };
    });

    res.json({
      recorded: true,
      starsEarned,
      starsTotal: result.starsTotal,
      bestScore: result.bestScore,
    });
  }
);

router.get("/leaderboard", async (_req, res) => {
  const rows = await prisma.miniGameBest.findMany({
    orderBy: { bestScore: "desc" },
    take: 50,
    include: {
      user: { select: { id: true, name: true } },
    },
  });
  res.json(
    rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      name: r.user.name,
      bestScore: r.bestScore,
    }))
  );
});

export const gameRouter = router;
