import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { routeParam } from "../util/routeParams.js";

const router = Router();
router.use(authMiddleware);

const MAX_GROUPS_PER_STUDENT = 3;

router.post(
  "/",
  requireRole(Role.TEACHER, Role.ADMIN),
  async (req, res) => {
    const schema = z.object({ name: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Укажите name" });
      return;
    }
    const g = await prisma.group.create({
      data: { name: parsed.data.name, creatorId: req.userId! },
    });
    res.status(201).json(g);
  }
);

router.get("/", async (_req, res) => {
  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  res.json(groups);
});

router.post(
  "/:groupId/members",
  requireRole(Role.TEACHER, Role.ADMIN),
  async (req, res) => {
    const groupId = routeParam(req.params.groupId);
    if (!groupId) {
      res.status(400).json({ error: "Нужен groupId" });
      return;
    }
    const schema = z.object({ studentId: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Нужен studentId" });
      return;
    }
    const { studentId } = parsed.data;

    const count = await prisma.groupMember.count({ where: { studentId } });
    if (count >= MAX_GROUPS_PER_STUDENT) {
      res.status(400).json({
        error: `Ученик может быть максимум в ${MAX_GROUPS_PER_STUDENT} группах`,
      });
      return;
    }

    await prisma.groupMember.upsert({
      where: {
        groupId_studentId: { groupId, studentId },
      },
      create: { groupId, studentId },
      update: {},
    });
    res.json({ ok: true });
  }
);

router.delete(
  "/:groupId/members/:studentId",
  requireRole(Role.TEACHER, Role.ADMIN),
  async (req, res) => {
    const groupId = routeParam(req.params.groupId);
    const studentId = routeParam(req.params.studentId);
    if (!groupId || !studentId) {
      res.status(400).json({ error: "Нужны groupId и studentId" });
      return;
    }
    await prisma.groupMember.deleteMany({
      where: { groupId, studentId },
    });
    res.json({ ok: true });
  }
);

router.get("/:groupId/rating", async (req, res) => {
  const groupId = routeParam(req.params.groupId);
  if (!groupId) {
    res.status(400).json({ error: "Нужен groupId" });
    return;
  }
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: {
      student: { select: { id: true, name: true, starsTotal: true } },
    },
  });
  const sorted = members
    .map((m) => m.student)
    .sort((a, b) => b.starsTotal - a.starsTotal);
  res.json(sorted);
});

export const groupsRouter = router;
