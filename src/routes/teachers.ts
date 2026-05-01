import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

/** Список учеников, закреплённых за преподавателем */
router.get(
  "/my/students",
  requireRole(Role.TEACHER, Role.ADMIN),
  async (req, res) => {
    const teacherId = req.userRole === Role.ADMIN ? undefined : req.userId!;
    const where = teacherId ? { teacherId } : {};
    const links = await prisma.teacherOnStudent.findMany({
      where,
      include: {
        student: {
          select: { id: true, name: true, email: true, starsTotal: true },
        },
      },
    });
    res.json(links.map((l) => l.student));
  }
);

const linkSchema = z.object({ studentId: z.string() });

/** Закрепить ученика (преподаватель или админ) */
router.post(
  "/link",
  requireRole(Role.TEACHER, Role.ADMIN),
  async (req, res) => {
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Нужен studentId" });
      return;
    }
    const { studentId } = parsed.data;
    const teacherId =
      req.userRole === Role.ADMIN
        ? (req.body.teacherId as string | undefined)
        : req.userId!;

    if (!teacherId) {
      res.status(400).json({ error: "Для админа укажите teacherId" });
      return;
    }

    const student = await prisma.user.findFirst({
      where: { id: studentId, role: Role.STUDENT },
    });
    if (!student) {
      res.status(404).json({ error: "Ученик не найден" });
      return;
    }

    const teacher = await prisma.user.findFirst({
      where: { id: teacherId, role: { in: [Role.TEACHER, Role.ADMIN] } },
    });
    if (!teacher) {
      res.status(404).json({ error: "Преподаватель не найден" });
      return;
    }

    await prisma.teacherOnStudent.upsert({
      where: {
        teacherId_studentId: { teacherId, studentId },
      },
      create: { teacherId, studentId },
      update: {},
    });
    res.json({ ok: true });
  }
);

/** Ученик: мои преподаватели */
router.get("/my/teachers", requireRole(Role.STUDENT), async (req, res) => {
  const links = await prisma.teacherOnStudent.findMany({
    where: { studentId: req.userId! },
    include: {
      teacher: {
        select: { id: true, name: true, email: true },
      },
    },
  });
  res.json(links.map((l) => l.teacher));
});

export const teachersRouter = router;
