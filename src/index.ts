import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { teachersRouter } from "./routes/teachers.js";
import { groupsRouter } from "./routes/groups.js";
import { quizzesRouter } from "./routes/quizzes.js";
import { questsRouter } from "./routes/quests.js";
import { gameRouter } from "./routes/game.js";
import { ratingsRouter } from "./routes/ratings.js";
import { chatRouter } from "./routes/chat.js";
import { staiRouter } from "./routes/stai.js";
import { adminRouter } from "./routes/admin.js";
import { attachChatWss } from "./realtime/chatWss.js";

const app = express();
app.use(helmet());
app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "study-task" });
});

app.use("/api/auth", authRouter);
app.use("/api/teachers", teachersRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/quizzes", quizzesRouter);
app.use("/api/quests", questsRouter);
app.use("/api/game", gameRouter);
app.use("/api/ratings", ratingsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/stai", staiRouter);
app.use("/api/admin", adminRouter);

const server = createServer(app);

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\n[study-task] Порт ${config.port} уже занят.\n` +
        `  • Смените PORT в .env (например 3002) и VITE_API_URL в client/.env на тот же адрес.\n` +
        `  • Или освободите порт: netstat -ano | findstr :${config.port}  →  taskkill /PID <pid> /F\n`
    );
    process.exit(1);
  }
  throw err;
});

attachChatWss(server);

server.listen(config.port, () => {
  console.log(`Study Task API http://localhost:${config.port}`);
});
