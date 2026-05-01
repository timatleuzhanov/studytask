import { Router } from "express";
import { z } from "zod";
import { QuestStepType, Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { routeParam } from "../util/routeParams.js";

const router = Router();
router.use(authMiddleware);

router.post(
  "/",
  requireRole(Role.TEACHER, Role.ADMIN),
  async (req, res) => {
    const schema = z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      rewardStars: z.number().int().min(0),
      steps: z
        .array(
          z.object({
            order: z.number().int(),
            stepType: z.nativeEnum(QuestStepType),
            quizId: z.string().optional(),
          })
        )
        .min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректный квест", details: parsed.error.flatten() });
      return;
    }

    const quest = await prisma.quest.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        rewardStars: parsed.data.rewardStars,
        createdById: req.userId!,
        steps: {
          create: parsed.data.steps.map((s) => ({
            order: s.order,
            stepType: s.stepType,
            quizId: s.quizId,
          })),
        },
      },
      include: { steps: true },
    });
    res.status(201).json(quest);
  }
);

router.get("/", async (_req, res) => {
  const list = await prisma.quest.findMany({
    orderBy: { createdAt: "desc" },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  res.json(list);
});

router.post(
  "/:questId/start",
  requireRole(Role.STUDENT),
  async (req, res) => {
    const questId = routeParam(req.params.questId);
    if (!questId) {
      res.status(400).json({ error: "Нужен questId" });
      return;
    }
    const p = await prisma.questProgress.upsert({
      where: {
        questId_studentId: { questId, studentId: req.userId! },
      },
      create: { questId, studentId: req.userId!, currentStep: 0, completed: false },
      update: {},
    });
    res.json(p);
  }
);

router.post(
  "/:questId/complete-step",
  requireRole(Role.STUDENT),
  async (req, res) => {
    const questId = routeParam(req.params.questId);
    if (!questId) {
      res.status(400).json({ error: "Нужен questId" });
      return;
    }
    const progress = await prisma.questProgress.findUnique({
      where: {
        questId_studentId: { questId, studentId: req.userId! },
      },
      include: { quest: { include: { steps: { orderBy: { order: "asc" } } } } },
    });
    if (!progress) {
      res.status(404).json({ error: "Сначала начните квест" });
      return;
    }

    const steps = progress.quest.steps;
    const next = progress.currentStep + 1;
    const completed = next >= steps.length;

    if (completed) {
      await prisma.$transaction(async (tx) => {
        await tx.questProgress.update({
          where: { id: progress.id },
          data: { currentStep: next, completed: true },
        });
        const reward = progress.quest.rewardStars;
        if (reward > 0) {
          await tx.user.update({
            where: { id: req.userId! },
            data: { starsTotal: { increment: reward } },
          });
          await tx.starLedger.create({
            data: {
              userId: req.userId!,
              delta: reward,
              reason: `Квест «${progress.quest.title}»`,
              refType: "QUEST",
              refId: questId,
            },
          });
        }
      });
      res.json({ completed: true, rewardStars: progress.quest.rewardStars });
      return;
    }

    const updated = await prisma.questProgress.update({
      where: { id: progress.id },
      data: { currentStep: next },
    });
    res.json({ completed: false, progress: updated });
  }
);

export const questsRouter = router;
