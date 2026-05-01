import { api } from "./api.js";
import type { Me } from "./portals.js";

function el(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

type PlayPayload = {
  assignmentId: string;
  quizTitle: string;
  description: string | null;
  maxStars: number;
  partialStarsBand: number | null;
  assignedByName: string;
  questionCount: number;
  questions: { id: string; text: string; options: string[] }[];
  attempts: {
    id: string;
    score: number;
    attemptType: string;
    starsGranted: number;
    createdAt: string;
  }[];
  bestScore: number;
  latestScore: number | null;
  hadPerfectScore: boolean;
  canSubmitNew: boolean;
  submitBlockedReason: string | null;
  rulesHint: { below50: string; band5099: string; perfect: string };
};

type SubmitResult = {
  score: number;
  starsDelta: number;
  starsTotal: number;
  bestScore: number;
  latestScore: number;
  canRetake: boolean;
  hadPerfectScore: boolean;
  attemptHistory: {
    score: number;
    attemptType: string;
    starsGranted: number;
    createdAt: string;
  }[];
};

/** Полноэкранное прохождение квиза (ТЗ: 0–100 баллов, история попыток). */
export async function openQuizTaker(
  assignmentId: string,
  me: Me,
  onDone: (starsTotal: number) => void
): Promise<void> {
  let data: PlayPayload;
  try {
    data = await api<PlayPayload>(`/api/quizzes/assignments/${assignmentId}/play`);
  } catch (e) {
    alert(String(e));
    return;
  }

  const overlay = el(`<div class="quiz-overlay" role="dialog" aria-modal="true" aria-label="Квиз"></div>`);
  const panel = el(`<div class="quiz-panel card"></div>`);

  function close(): void {
    overlay.remove();
    document.body.style.overflow = "";
  }

  function renderHistory(): string {
    if (!data.attempts.length) return "<p class=\"sub\">Пока нет попыток.</p>";
    return `<ul class="quiz-history">
      ${data.attempts
        .map(
          (a) =>
            `<li><span>${new Date(a.createdAt).toLocaleString("ru-RU")}</span>
            <strong>${a.score}%</strong>
            <span class="chip">${a.attemptType === "FIRST" ? "первая" : "пересдача"}</span>
            ${a.starsGranted !== 0 ? `<span class="chip">${a.starsGranted > 0 ? "+" : ""}${a.starsGranted} ☆</span>` : ""}
            </li>`
        )
        .join("")}
    </ul>`;
  }

  function headerBlock(): HTMLElement {
    return el(`<div class="quiz-top">
      <button type="button" class="btn tiny ghost quiz-close" aria-label="Закрыть">✕</button>
      <h2 class="quiz-title">${esc(data.quizTitle)}</h2>
      <p class="sub">От ${esc(data.assignedByName)} · до ${data.maxStars} ☆ за 100%</p>
      ${data.description ? `<p class="sub">${esc(data.description)}</p>` : ""}
      <div class="quiz-rules card inner">
        <p class="sub"><strong>Правила:</strong></p>
        <ul class="quiz-rules-list">
          <li>${esc(data.rulesHint.below50)}</li>
          <li>${esc(data.rulesHint.band5099)}</li>
          <li>${esc(data.rulesHint.perfect)}</li>
        </ul>
      </div>
      <div class="quiz-meta">
        <span class="chip">Лучший: ${data.bestScore}%</span>
        ${data.latestScore != null ? `<span class="chip">Последняя: ${data.latestScore}%</span>` : ""}
        ${data.hadPerfectScore ? `<span class="chip success">Было 100%</span>` : ""}
      </div>
    </div>`);
  }

  const top = headerBlock();
  top.querySelector(".quiz-close")?.addEventListener("click", () => {
    close();
    onDone(me.starsTotal);
  });

  panel.append(top);

  const historySection = el(`<section class="quiz-section"><h3>История</h3>${renderHistory()}</section>`);
  panel.append(historySection);

  if (!data.canSubmitNew) {
    panel.append(
      el(`<p class="error">${esc(data.submitBlockedReason || "Нельзя отправить новую попытку.")}</p>`)
    );
    const done = el(`<button type="button" class="btn secondary" style="margin-top:1rem">Закрыть</button>`);
    done.addEventListener("click", () => {
      close();
      onDone(me.starsTotal);
    });
    panel.append(done);
    overlay.append(panel);
    document.body.append(overlay);
    document.body.style.overflow = "hidden";
    return;
  }

  const answers: (number | null)[] = data.questions.map(() => null);
  let step = 0;

  const formWrap = el(`<section class="quiz-section"><h3>Прохождение</h3></section>`);
  const progress = el(`<div class="quiz-progress"></div>`);
  const body = el(`<div class="quiz-step-body"></div>`);
  const nav = el(`<div class="quiz-nav"></div>`);
  const errBox = el(`<div class="error" hidden></div>`);

  function paintProgress(): void {
    progress.innerHTML = data.questions
      .map((_, i) => `<span class="quiz-dot ${i === step ? "on" : ""} ${answers[i] !== null ? "done" : ""}"></span>`)
      .join("");
  }

  function paintStep(): void {
    const q = data.questions[step];
    const sel = answers[step];
    body.innerHTML = `
      <p class="quiz-q-num">Вопрос ${step + 1} из ${data.questions.length}</p>
      <h4 class="quiz-q-text">${esc(q.text)}</h4>
      <div class="quiz-options">
        ${q.options
          .map(
            (opt, j) =>
              `<button type="button" class="quiz-opt ${sel === j ? "selected" : ""}" data-j="${j}">${esc(opt)}</button>`
          )
          .join("")}
      </div>
    `;
    body.querySelectorAll<HTMLButtonElement>(".quiz-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        const j = Number(btn.dataset.j);
        answers[step] = j;
        paintProgress();
        paintStep();
      });
    });

    const atFirst = step === 0;
    const atLast = step === data.questions.length - 1;
    nav.innerHTML = `
      <button type="button" class="btn secondary quiz-prev" ${atFirst ? "disabled" : ""}>Назад</button>
      <button type="button" class="btn ${atLast ? "quiz-submit" : "quiz-next"}">${atLast ? "Отправить ответы" : "Дальше"}</button>
    `;
    nav.querySelector(".quiz-prev")?.addEventListener("click", () => {
      if (step > 0) {
        step--;
        paintProgress();
        paintStep();
      }
    });
    const nextBtn = nav.querySelector(".quiz-next, .quiz-submit");
    nextBtn?.addEventListener("click", async () => {
      if (answers[step] === null) {
        errBox.textContent = "Выберите вариант ответа";
        errBox.hidden = false;
        return;
      }
      errBox.hidden = true;
      if (!atLast) {
        step++;
        paintProgress();
        paintStep();
        return;
      }
      const payload = answers.map((a) => (a === null ? -1 : a));
      if (payload.some((x) => x < 0)) {
        errBox.textContent = "Ответьте на все вопросы";
        errBox.hidden = false;
        return;
      }
      try {
        const res = await api<SubmitResult>(`/api/quizzes/assignments/${assignmentId}/submit`, {
          method: "POST",
          body: JSON.stringify({ answers: payload }),
        });
        me.starsTotal = res.starsTotal;
        formWrap.innerHTML = `
          <h3>Результат</h3>
          <div class="quiz-result card inner">
            <p class="quiz-result-score">${res.score}%</p>
            <p class="sub">Изменение звёзд за эту попытку: <strong>${res.starsDelta > 0 ? "+" : ""}${res.starsDelta}</strong></p>
            <p class="sub">Всего звёзд: <strong>${res.starsTotal}</strong></p>
            <p class="sub">${res.canRetake ? "Можно сдать ещё раз (см. правила)." : "Новых попыток по звёздам нет (или доступна только тренировка после 100%)."}</p>
          </div>
          <h4 class="mt">История попыток</h4>
          <ul class="quiz-history inner">
            ${res.attemptHistory
              .map(
                (a) =>
                  `<li><span>${new Date(a.createdAt).toLocaleString("ru-RU")}</span>
                  <strong>${a.score}%</strong>
                  <span class="chip">${a.attemptType === "FIRST" ? "первая" : "пересдача"}</span>
                  ${a.starsGranted !== 0 ? `<span class="chip">${a.starsGranted > 0 ? "+" : ""}${a.starsGranted} ☆</span>` : ""}
                  </li>`
              )
              .join("")}
          </ul>
          <button type="button" class="btn secondary quiz-done" style="margin-top:1rem">Закрыть</button>
        `;
        formWrap.querySelector(".quiz-done")?.addEventListener("click", () => {
          close();
          onDone(res.starsTotal);
        });
      } catch (ex) {
        errBox.textContent = String(ex).replace(/^Error: /, "");
        errBox.hidden = false;
      }
    });
  }

  formWrap.append(progress, body, nav, errBox);
  panel.append(formWrap);

  paintProgress();
  paintStep();

  overlay.append(panel);
  document.body.append(overlay);
  document.body.style.overflow = "hidden";
  overlay.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      close();
      onDone(me.starsTotal);
    }
  });
}
