import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import {
  parseQuestions,
  scoreQuiz,
  starsForScore,
  canAddAttempt,
  attemptTypeFor,
  sanitizeQuestions,
  bestScoreFromAttempts,
  starsPartialBand,
} from "../services/quizScoring.js";
import { routeParam } from "../util/routeParams.js";

const router = Router();
router.use(authMiddleware);

const questionSchema = z.object({
  id: z.string(),
  text: z.string(),
  options: z.array(z.string()),
  correctIndex: z.number().int().min(0),
});

router.post(
  "/",
  requireRole(Role.TEACHER, Role.ADMIN),
  async (req, res) => {
    const schema = z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      maxStars: z.number().int().min(1).max(100).optional(),
      partialStars: z.number().int().min(0).max(100).optional().nullable(),
      questions: z.array(questionSchema).min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректный квиз", details: parsed.error.flatten() });
      return;
    }

    const { partialStars, maxStars: rawMax, ...rest } = parsed.data;
    const maxStars = rawMax ?? 10;
    const partial =
      partialStars === undefined || partialStars === null
        ? undefined
        : Math.min(partialStars, maxStars);

    const q = await prisma.quiz.create({
      data: {
        title: rest.title,
        description: rest.description,
        maxStars,
        partialStars: partial ?? null,
        questions: rest.questions,
        createdById: req.userId!,
      },
    });
    res.status(201).json(q);
  }
);

router.post(
  "/ai/generate",
  requireRole(Role.TEACHER, Role.ADMIN),
  async (req, res) => {
    const schema = z.object({ topic: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Укажите topic" });
      return;
    }
    const topic = parsed.data.topic;
    const questions = [
      {
        id: "q1",
        text: `Что лучше описывает тему «${topic}»?`,
        options: ["Основная идея", "Второстепенное", "Не относится", "Не знаю"],
        correctIndex: 0,
      },
      {
        id: "q2",
        text: `Практическое применение «${topic}»:`,
        options: ["Широкое", "Редкое", "Никакое", "Случайное"],
        correctIndex: 0,
      },
    ];
    const quiz = await prisma.quiz.create({
      data: {
        title: `AI: ${topic}`,
        description: "Сгенерировано заглушкой (подключите LLM к /api/stai)",
        maxStars: 10,
        partialStars: null,
        questions,
        createdById: req.userId!,
      },
    });
    res.status(201).json(quiz);
  }
);

router.get("/mine", requireRole(Role.TEACHER, Role.ADMIN), async (req, res) => {
  const list = await prisma.quiz.findMany({
    where: { createdById: req.userId! },
    orderBy: { createdAt: "desc" },
  });
  res.json(list);
});

router.get("/assigned", requireRole(Role.STUDENT), async (req, res) => {
  const assignments = await prisma.quizAssignment.findMany({
    where: { studentId: req.userId! },
    include: {
      quiz: true,
      assignedBy: { select: { id: true, name: true } },
      attempts: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(
    assignments.map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      quiz: {
        id: a.quiz.id,
        title: a.quiz.title,
        description: a.quiz.description,
        maxStars: a.quiz.maxStars,
        partialStars: a.quiz.partialStars,
        questions: sanitizeQuestions(a.quiz.questions),
      },
      assignedBy: a.assignedBy,
      attempts: a.attempts.map((t) => ({
        id: t.id,
        score: t.score,
        starsGranted: t.starsGranted,
        attemptType: t.attemptType,
        createdAt: t.createdAt,
      })),
      stats: {
        bestScore: bestScoreFromAttempts(a.attempts),
        attemptCount: a.attempts.length,
        hadPerfectScore: a.attempts.some((x) => x.score === 100),
      },
    }))
  );
});

/** Данные для прохождения: без correctIndex + статус попыток (ТЗ 4.3–4.5). */
router.get(
  "/assignments/:assignmentId/play",
  requireRole(Role.STUDENT),
  async (req, res) => {
    const assignmentId = routeParam(req.params.assignmentId);
    if (!assignmentId) {
      res.status(400).json({ error: "Нужен assignmentId" });
      return;
    }

    const assignment = await prisma.quizAssignment.findFirst({
      where: { id: assignmentId, studentId: req.userId! },
      include: {
        quiz: true,
        attempts: { orderBy: { createdAt: "asc" } },
        assignedBy: { select: { name: true } },
      },
    });

    if (!assignment) {
      res.status(404).json({ error: "Назначение не найдено" });
      return;
    }

    const questions = sanitizeQuestions(assignment.quiz.questions);
    const gate = canAddAttempt(assignment.attempts);
    const bestScore = bestScoreFromAttempts(assignment.attempts);
    const had100 = assignment.attempts.some((x) => x.score === 100);
    const latest = assignment.attempts.length
      ? assignment.attempts[assignment.attempts.length - 1]
      : null;

    res.json({
      assignmentId: assignment.id,
      quizTitle: assignment.quiz.title,
      description: assignment.quiz.description,
      maxStars: assignment.quiz.maxStars,
      partialStarsBand: assignment.quiz.partialStars,
      assignedByName: assignment.assignedBy.name,
      questionCount: questions.length,
      questions,
      attempts: assignment.attempts.map((t) => ({
        id: t.id,
        score: t.score,
        attemptType: t.attemptType,
        starsGranted: t.starsGranted,
        createdAt: t.createdAt,
      })),
      bestScore,
      latestScore: latest?.score ?? null,
      hadPerfectScore: had100,
      canSubmitNew: gate.ok,
      submitBlockedReason: gate.ok ? null : gate.reason,
      rulesHint: {
        below50: "Меньше 50%: −5 звёзд, доступна одна пересдача.",
        band5099: `50–99%: +${starsPartialBand(assignment.quiz)} ☆ за попытку (настройка квиза), одна пересдача.`,
        perfect:
          "100%: все звёзды квиза; дальнейшие попытки без ограничения, без дополнительных звёзд.",
      },
    });
  }
);

const assignSchema = z.object({ studentId: z.string() });

router.post(
  "/:quizId/assign",
  requireRole(Role.TEACHER, Role.ADMIN),
  async (req, res) => {
    const quizId = routeParam(req.params.quizId);
    if (!quizId) {
      res.status(400).json({ error: "Нужен quizId" });
      return;
    }
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Нужен studentId" });
      return;
    }
    const { studentId } = parsed.data;

    const link = await prisma.teacherOnStudent.findFirst({
      where: { teacherId: req.userId!, studentId },
    });
    if (!link && req.userRole !== Role.ADMIN) {
      res.status(403).json({
        error: "Назначать можно только закреплённым ученикам",
      });
      return;
    }

    const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) {
      res.status(404).json({ error: "Квиз не найден" });
      return;
    }

    const assignment = await prisma.quizAssignment.create({
      data: {
        quizId,
        studentId,
        assignedById: req.userId!,
      },
      include: { quiz: true },
    });
    res.status(201).json(assignment);
  }
);

const submitSchema = z.object({
  answers: z.array(z.number().int()),
});

router.post(
  "/assignments/:assignmentId/submit",
  requireRole(Role.STUDENT),
  async (req, res) => {
    const assignmentId = routeParam(req.params.assignmentId);
    if (!assignmentId) {
      res.status(400).json({ error: "Нужен assignmentId" });
      return;
    }
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Нужен массив answers" });
      return;
    }

    const assignment = await prisma.quizAssignment.findFirst({
      where: { id: assignmentId, studentId: req.userId! },
      include: { quiz: true },
    });
    if (!assignment) {
      res.status(404).json({ error: "Назначение не найдено" });
      return;
    }

    const questions = parseQuestions(assignment.quiz.questions);
    if (parsed.data.answers.length !== questions.length) {
      res.status(400).json({
        error: `Нужно ответить на все вопросы (${questions.length}), получено ${parsed.data.answers.length}.`,
      });
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      const idx = parsed.data.answers[i];
      if (idx < 0 || idx >= questions[i].options.length) {
        res.status(400).json({
          error: `Некорректный вариант ответа в вопросе ${i + 1}.`,
        });
        return;
      }
    }

    const score = scoreQuiz(questions, parsed.data.answers);

    const prior = await prisma.quizAttempt.findMany({
      where: { assignmentId },
      orderBy: { createdAt: "asc" },
    });

    const gate = canAddAttempt(prior);
    if (!gate.ok) {
      res.status(400).json({ error: gate.reason });
      return;
    }

    const had100 = prior.some((a) => a.score === 100);
    let isolated = starsForScore(assignment.quiz, score);
    if (prior.length > 0 && had100) {
      isolated = 0;
    }

    let netStars = isolated;
    if (prior.length > 0 && !had100) {
      const last = prior[prior.length - 1];
      netStars = isolated - last.starsGranted;
    }

    const attemptType = attemptTypeFor(prior);

    const result = await prisma.$transaction(async (tx) => {
      const attempt = await tx.quizAttempt.create({
        data: {
          assignmentId,
          score,
          starsGranted: isolated,
          attemptType,
        },
      });

      if (netStars !== 0) {
        await tx.user.update({
          where: { id: req.userId! },
          data: { starsTotal: { increment: netStars } },
        });
        await tx.starLedger.create({
          data: {
            userId: req.userId!,
            delta: netStars,
            reason: `Квиз «${assignment.quiz.title}»`,
            refType: "QUIZ_ASSIGNMENT",
            refId: assignmentId,
          },
        });
      }

      const user = await tx.user.findUnique({
        where: { id: req.userId! },
        select: { starsTotal: true },
      });

      const allAttempts = await tx.quizAttempt.findMany({
        where: { assignmentId },
        orderBy: { createdAt: "asc" },
      });

      return {
        attempt,
        starsTotal: user?.starsTotal ?? 0,
        allAttempts,
      };
    });

    const after = result.allAttempts;
    const newHad100 = after.some((a) => a.score === 100);
    const canRetake = canAddAttempt(after).ok;

    res.json({
      score,
      starsDelta: netStars,
      starsGrantedThisAttempt: isolated,
      attempt: {
        id: result.attempt.id,
        score: result.attempt.score,
        attemptType: result.attempt.attemptType,
        starsGranted: result.attempt.starsGranted,
        createdAt: result.attempt.createdAt,
      },
      starsTotal: result.starsTotal,
      bestScore: bestScoreFromAttempts(after),
      latestScore: score,
      canRetake,
      hadPerfectScore: newHad100,
      attemptHistory: after.map((t) => ({
        score: t.score,
        attemptType: t.attemptType,
        starsGranted: t.starsGranted,
        createdAt: t.createdAt,
      })),
    });
  }
);

export const quizzesRouter = router;
