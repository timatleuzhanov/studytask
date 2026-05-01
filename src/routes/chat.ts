import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { routeParam } from "../util/routeParams.js";

const router = Router();
router.use(authMiddleware);

async function areLinked(a: string, b: string): Promise<boolean> {
  const [t1, t2] = await Promise.all([
    prisma.teacherOnStudent.findFirst({
      where: { teacherId: a, studentId: b },
    }),
    prisma.teacherOnStudent.findFirst({
      where: { teacherId: b, studentId: a },
    }),
  ]);
  return !!(t1 || t2);
}

router.get("/with/:peerId", async (req, res) => {
  const peerId = routeParam(req.params.peerId);
  if (!peerId) {
    res.status(400).json({ error: "Нужен peerId" });
    return;
  }
  const me = req.userId!;

  const peer = await prisma.user.findUnique({ where: { id: peerId } });
  if (!peer) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }

  const allowed =
    req.userRole === Role.ADMIN ||
    (await areLinked(me, peerId)) ||
    me === peerId;

  if (!allowed) {
    res.status(403).json({ error: "Чат только с закреплённым преподавателем" });
    return;
  }

  const messages = await prisma.chatMessage.findMany({
    where: {
      OR: [
        { fromId: me, toId: peerId },
        { fromId: peerId, toId: me },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  res.json(messages);
});

const sendSchema = z.object({ toId: z.string(), body: z.string().min(1).max(4000) });

router.post("/send", async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректное сообщение" });
    return;
  }
  const { toId, body } = parsed.data;
  const fromId = req.userId!;

  if (fromId === toId) {
    res.status(400).json({ error: "Нельзя написать самому себе" });
    return;
  }

  const allowed =
    req.userRole === Role.ADMIN || (await areLinked(fromId, toId));

  if (!allowed) {
    res.status(403).json({ error: "Чат только с закреплённым преподавателем" });
    return;
  }

  const msg = await prisma.chatMessage.create({
    data: { fromId, toId, body },
  });
  res.status(201).json(msg);
});

export const chatRouter = router;
