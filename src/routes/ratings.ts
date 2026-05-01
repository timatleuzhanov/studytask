import { Router } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/global", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: Role.STUDENT },
    orderBy: { starsTotal: "desc" },
    take: 100,
    select: { id: true, name: true, starsTotal: true },
  });
  res.json(users.map((u, i) => ({ rank: i + 1, ...u })));
});

export const ratingsRouter = router;
