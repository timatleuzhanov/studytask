import { Router } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole(Role.ADMIN));

router.get("/users", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const where = q
    ? {
        OR: [{ id: q }, { name: { contains: q } }, { email: { contains: q } }],
      }
    : {};
  const users = await prisma.user.findMany({
    where,
    take: 50,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      starsTotal: true,
      createdAt: true,
    },
  });
  res.json(users);
});

router.get("/analytics/summary", async (_req, res) => {
  const [users, quizzes, attempts, gameAttempts] = await Promise.all([
    prisma.user.groupBy({
      by: ["role"],
      _count: true,
    }),
    prisma.quiz.count(),
    prisma.quizAttempt.count(),
    prisma.miniGameAttempt.count(),
  ]);
  res.json({ usersByRole: users, quizzes, quizAttempts: attempts, miniGameSessions: gameAttempts });
});

router.get("/quiz-attempts", async (req, res) => {
  const take = Math.min(200, Number(req.query.take) || 100);
  const rows = await prisma.quizAttempt.findMany({
    take,
    orderBy: { createdAt: "desc" },
    include: {
      assignment: {
        include: {
          quiz: { select: { title: true } },
          student: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  res.json(rows);
});

router.get("/game-attempts", async (req, res) => {
  const take = Math.min(200, Number(req.query.take) || 100);
  const rows = await prisma.miniGameAttempt.findMany({
    take,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
  res.json(rows);
});

export const adminRouter = router;
