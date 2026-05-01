import type { Quiz } from "@prisma/client";
import { QuizAttemptType } from "@prisma/client";

export type Question = {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
};

/** Вопрос для экрана прохождения (без правильного ответа) */
export type PublicQuestion = {
  id: string;
  text: string;
  options: string[];
};

export function parseQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  return raw as Question[];
}

export function sanitizeQuestions(raw: unknown): PublicQuestion[] {
  return parseQuestions(raw).map(({ id, text, options }) => ({
    id,
    text,
    options,
  }));
}

export function scoreQuiz(questions: Question[], answers: number[]): number {
  if (!questions.length) return 0;
  let correct = 0;
  for (let i = 0; i < questions.length; i++) {
    const guess = answers[i];
    if (guess === questions[i].correctIndex) correct++;
  }
  return Math.round((correct / questions.length) * 100);
}

/** Звёзды за диапазон 50–99 («по настройке» квиза, ТЗ п. 4.3) */
export function starsPartialBand(quiz: Quiz): number {
  if (quiz.partialStars != null) {
    return Math.max(0, Math.min(quiz.partialStars, quiz.maxStars));
  }
  return Math.max(1, Math.floor(quiz.maxStars / 2));
}

/**
 * Звёзды, которые соответствуют данному баллу за одну изолированную попытку
 * (без учёта замены пересдачи; для повторов после 100 на уровне маршрута обнуляется).
 */
export function starsForScore(quiz: Quiz, score: number): number {
  if (score < 50) return -5;
  if (score < 100) return starsPartialBand(quiz);
  return quiz.maxStars;
}

export function canAddAttempt(
  priorAttempts: { score: number }[]
): { ok: true } | { ok: false; reason: string } {
  if (priorAttempts.length === 0) return { ok: true };
  const had100 = priorAttempts.some((a) => a.score === 100);
  if (had100) return { ok: true };
  if (priorAttempts.length >= 2) {
    return {
      ok: false,
      reason: "Использована пересдача. Новая попытка доступна только после 100% (для тренировки, без звёзд).",
    };
  }
  return { ok: true };
}

export function attemptTypeFor(priorAttempts: unknown[]): QuizAttemptType {
  return priorAttempts.length === 0
    ? QuizAttemptType.FIRST
    : QuizAttemptType.RETAKE;
}

/** Лучший балл по всем попыткам (для отображения достижения). */
export function bestScoreFromAttempts(
  attempts: { score: number }[]
): number {
  if (!attempts.length) return 0;
  return Math.max(...attempts.map((a) => a.score));
}
