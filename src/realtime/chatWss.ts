import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import type { JwtPayload } from "../middleware/auth.js";

type ClientMeta = { userId: string; role: Role };

const clients = new Map<WebSocket, ClientMeta>();

async function canChat(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([
    prisma.teacherOnStudent.findFirst({ where: { teacherId: a, studentId: b } }),
    prisma.teacherOnStudent.findFirst({ where: { teacherId: b, studentId: a } }),
  ]);
  return !!(x || y);
}

export function attachChatWss(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws/chat" });

  wss.on("error", (err: Error) => {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EADDRINUSE") {
      return;
    }
    console.error("[ws/chat]", err.message);
  });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    if (!token) {
      ws.close(4001, "no token");
      return;
    }
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    } catch {
      ws.close(4002, "bad token");
      return;
    }
    clients.set(ws, { userId: payload.sub, role: payload.role });

    ws.on("message", async (raw) => {
      let data: { toId?: string; body?: string };
      try {
        data = JSON.parse(String(raw)) as { toId?: string; body?: string };
      } catch {
        return;
      }
      const { toId, body } = data;
      if (!toId || !body || !body.trim()) return;

      const from = clients.get(ws);
      if (!from) return;

      if (from.role !== "ADMIN" && !(await canChat(from.userId, toId))) {
        ws.send(JSON.stringify({ type: "error", message: "Нет связи с пользователем" }));
        return;
      }

      const msg = await prisma.chatMessage.create({
        data: { fromId: from.userId, toId, body: body.trim() },
      });

      const out = JSON.stringify({ type: "message", payload: msg });
      ws.send(out);
      for (const [other, meta] of clients) {
        if (meta.userId === toId || meta.userId === from.userId) {
          other.send(out);
        }
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });
  });
}
