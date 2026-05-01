import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum([Role.STUDENT, Role.TEACHER]).optional(),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
    return;
  }
  const { email, password, name } = parsed.data;
  const role = parsed.data.role ?? Role.STUDENT;

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    res.status(409).json({ error: "Email уже зарегистрирован" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      starsTotal: true,
      avatarUrl: true,
      about: true,
    },
  });

  const token = jwt.sign(
    { sub: user.id, role: user.role },
    config.jwtSecret,
    { expiresIn: "14d" }
  );
  res.status(201).json({ user, token });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  /** Если указан — роль аккаунта должна совпадать с порталом входа */
  portal: z.enum([Role.ADMIN, Role.TEACHER, Role.STUDENT]).optional(),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректные данные" });
    return;
  }
  const { email, password, portal } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: "Неверный email или пароль" });
    return;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Неверный email или пароль" });
    return;
  }
  if (portal && user.role !== portal) {
    res.status(403).json({
      error:
        portal === Role.ADMIN
          ? "Этот вход только для администраторов. Используйте другой портал."
          : portal === Role.TEACHER
            ? "Этот вход только для преподавателей."
            : "Этот вход только для учеников.",
    });
    return;
  }
  const token = jwt.sign(
    { sub: user.id, role: user.role },
    config.jwtSecret,
    { expiresIn: "14d" }
  );
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      starsTotal: user.starsTotal,
      avatarUrl: user.avatarUrl,
      about: user.about,
    },
  });
});

router.get("/me", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      starsTotal: true,
      avatarUrl: true,
      about: true,
      createdAt: true,
    },
  });
  if (!user) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }
  res.json(user);
});

const updateProfileSchema = z.object({
  email: z.string().email().optional(),
  avatarUrl: z.string().url().max(2000).nullable().optional(),
  about: z.string().max(1000).nullable().optional(),
});

router.patch("/profile", authMiddleware, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
    return;
  }
  const payload = parsed.data;
  if (Object.keys(payload).length === 0) {
    res.status(400).json({ error: "Нет данных для обновления" });
    return;
  }

  try {
    const updated = await prisma.user.update({
      where: { id: req.userId! },
      data: {
        email: payload.email,
        avatarUrl: payload.avatarUrl === undefined ? undefined : payload.avatarUrl,
        about: payload.about === undefined ? undefined : payload.about,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        starsTotal: true,
        avatarUrl: true,
        about: true,
      },
    });
    res.json(updated);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      res.status(409).json({ error: "Такой email уже используется" });
      return;
    }
    throw e;
  }
});

export const authRouter = router;
