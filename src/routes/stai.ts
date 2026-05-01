import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { config } from "../config.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole(Role.STUDENT, Role.TEACHER));

const askSchema = z.object({
  message: z.string().min(1).max(8000),
});

router.post("/ask", async (req, res) => {
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Укажите message" });
    return;
  }

  if (!config.staiApiKey) {
    res.json({
      reply:
        "STAI: API-ключ не настроен. Добавьте STAI_API_KEY в .env для подключения модели. " +
        "Пока кратко: разделы — дашборд, квизы, квесты, игра, чат, рейтинг; звёзды за задания и игру.",
    });
    return;
  }

  try {
    const r = await fetch(`${config.staiApiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.staiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Ты STAI — помощник образовательной платформы Study Task. Отвечай кратко и по делу, помогай с учёбой и навигацией.",
          },
          { role: "user", content: parsed.data.message },
        ],
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      res.status(502).json({ error: "Ошибка провайдера", detail: text });
      return;
    }
    const data = (await r.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const reply = data.choices?.[0]?.message?.content ?? "";
    res.json({ reply });
  } catch (e) {
    res.status(502).json({ error: "Не удалось обратиться к STAI", detail: String(e) });
  }
});

export const staiRouter = router;
