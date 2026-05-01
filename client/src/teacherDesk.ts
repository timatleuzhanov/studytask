import { api, setToken } from "./api.js";
import type { Me } from "./portals.js";

function el(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

type TTab = "overview" | "quizzes" | "create" | "students";

let teacherTab: TTab = "overview";

type QuizRow = { id: string; title: string; maxStars: number; description?: string | null };
type StudentRow = { id: string; name: string; email: string; starsTotal: number };

type QuestionDraft = { text: string; optionsText: string; correctIndex: number };

export function mountTeacherDesk(
  app: HTMLElement,
  me: Me,
  rerender: () => void
): void {
  app.className = "teacher-shell";
  app.innerHTML = "";

  const header = el(`<header class="teacher-topbar">
    <div class="teacher-top-title">Дашборд</div>
    <div class="teacher-top-right">
      <div class="teacher-avatar">${initials(me.name)}</div>
      <span class="teacher-name">${escapeHtml(me.name)}</span>
      <button type="button" class="teacher-logout" id="t-logout">
        <span aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 17l5-5-5-5"></path>
            <path d="M15 12H3"></path>
            <path d="M21 3v18"></path>
          </svg>
        </span>
        Выйти
      </button>
    </div>
  </header>`);
  header.querySelector("#t-logout")?.addEventListener("click", () => {
    setToken(null);
    rerender();
  });

  type SideItem =
    | { kind: "link"; id: TTab; label: string; icon: string; disabled?: false }
    | { kind: "disabled"; label: string; icon: string; reason: string };

  const sideItems: SideItem[] = [
    { kind: "link", id: "overview", label: "Дашборд", icon: "dash" },
    { kind: "disabled", label: "Курсы", icon: "book", reason: "Раздел временно недоступен" },
    { kind: "disabled", label: "Модули", icon: "layers", reason: "Раздел временно недоступен" },
    { kind: "disabled", label: "Уроки", icon: "lesson", reason: "Раздел временно недоступен" },
    { kind: "link", id: "quizzes", label: "Квизы", icon: "quiz" },
    { kind: "link", id: "create", label: "Домашнее задание", icon: "hw" },
    { kind: "link", id: "students", label: "Студенты", icon: "users" },
  ];

  const sidebar = el(`<aside class="teacher-sidebar" aria-label="Меню"></aside>`);
  sidebar.append(el(`<div class="teacher-side-brand">Study Task</div>`));
  const nav = el(`<nav class="teacher-nav"></nav>`);
  sideItems.forEach((it) => {
    if (it.kind === "disabled") {
      nav.append(
        el(`<button type="button" class="teacher-nav-item disabled" title="${escapeHtml(it.reason)}" aria-disabled="true">
          <span class="ico" aria-hidden="true">${sideIcon(it.icon)}</span>
          <span>${escapeHtml(it.label)}</span>
        </button>`)
      );
      return;
    }
    const b = el(`<button type="button" class="teacher-nav-item ${teacherTab === it.id ? "active" : ""}">
      <span class="ico" aria-hidden="true">${sideIcon(it.icon)}</span>
      <span>${escapeHtml(it.label)}</span>
    </button>`);
    b.addEventListener("click", () => {
      teacherTab = it.id;
      mountTeacherDesk(app, me, rerender);
    });
    nav.append(b);
  });
  sidebar.append(nav);

  const body = el(`<main class="teacher-main"></main>`);

  void (async () => {
    if (teacherTab === "overview") {
      let quizCount = 0;
      let studCount = 0;
      try {
        const qs = await api<QuizRow[]>("/api/quizzes/mine");
        quizCount = qs.length;
      } catch {
        /* */
      }
      try {
        const st = await api<StudentRow[]>("/api/teachers/my/students");
        studCount = st.length;
      } catch {
        /* */
      }
      body.append(
        el(`<div class="teacher-card teacher-welcome">
          <h2>Добро пожаловать, ${escapeHtml(me.name)}!</h2>
        </div>`)
      );
      body.append(
        el(`<div class="teacher-kpis">
          <div class="teacher-kpi">
            <div class="kpi-ico" aria-hidden="true">${kpiIcon("courses")}</div>
            <div class="kpi-val">${quizCount}</div>
            <div class="kpi-lbl">Ваших квизов</div>
          </div>
          <div class="teacher-kpi">
            <div class="kpi-ico" aria-hidden="true">${kpiIcon("modules")}</div>
            <div class="kpi-val">0</div>
            <div class="kpi-lbl">Модулей</div>
          </div>
          <div class="teacher-kpi">
            <div class="kpi-ico" aria-hidden="true">${kpiIcon("lessons")}</div>
            <div class="kpi-val">0</div>
            <div class="kpi-lbl">Уроков</div>
          </div>
          <div class="teacher-kpi">
            <div class="kpi-ico" aria-hidden="true">${kpiIcon("students")}</div>
            <div class="kpi-val">${studCount}</div>
            <div class="kpi-lbl">Студентов</div>
          </div>
        </div>`)
      );
      body.append(
        el(`<div class="teacher-card teacher-note">
          <div class="note-box">
            У вас пока нет назначенных курсов. Обратитесь к администратору.
          </div>
        </div>`)
      );
    }

    if (teacherTab === "quizzes") {
      let list: QuizRow[] = [];
      try {
        list = await api<QuizRow[]>("/api/quizzes/mine");
      } catch {
        body.append(el(`<p class="error">Не удалось загрузить квизы</p>`));
      }
      if (!list.length) {
        body.append(el(`<p class="sub">Пока нет квизов — создайте в разделе «Новый квиз».</p>`));
      }
      list.forEach((q) => {
        body.append(
          el(`<div class="card list-row">
            <div><h3>${escapeHtml(q.title)}</h3><p>До ${q.maxStars} ★ · id: <code>${q.id}</code></p></div>
          </div>`)
        );
      });
    }

    if (teacherTab === "create") {
      const drafts: QuestionDraft[] = [
        { text: "", optionsText: "Вариант A\nВариант B\nВариант C\nВариант D", correctIndex: 0 },
      ];
      const form = el(`<div class="teacher-card quiz-builder"></div>`);
      form.innerHTML = `
        <h2>Домашнее задание</h2>
        <p class="sub">Пока используйте квизы как домашние задания. Раздел курсов/модулей/уроков будет добавлен позже.</p>
        <hr class="teacher-hr" />
        <h2>Создание квиза</h2>
        <label>Название</label>
        <input type="text" id="qz-title" placeholder="Например: Дроби, тема 3" />
        <label>Описление (необязательно)</label>
        <input type="text" id="qz-desc" placeholder="Кратко о содержании" />
        <label>Макс. звёзд при 100%</label>
        <input type="number" id="qz-stars" min="1" max="50" value="10" />
        <label>Звёзд за 50–99% (пусто = половина от макс., ТЗ)</label>
        <input type="number" id="qz-partial" min="0" max="50" placeholder="авто" />
        <div id="qz-questions" class="qz-q-list"></div>
        <button type="button" class="btn secondary" id="qz-add-q">+ Вопрос</button>
        <div class="error" id="qz-err" hidden></div>
        <button type="button" class="btn" id="qz-save">Сохранить квиз</button>
      `;

      function renderQuestions(): void {
        const host = form.querySelector("#qz-questions")!;
        host.innerHTML = "";
        drafts.forEach((d, i) => {
          const block = el(`<div class="qz-q card inner"></div>`);
          block.innerHTML = `
            <div class="qz-q-head"><strong>Вопрос ${i + 1}</strong>
              ${drafts.length > 1 ? `<button type="button" class="btn tiny danger ghost" data-idx="${i}">Удалить</button>` : ""}
            </div>
            <label>Текст</label>
            <textarea data-f="text" data-i="${i}" rows="2">${escapeHtml(d.text)}</textarea>
            <label>Варианты (каждый с новой строки)</label>
            <textarea data-f="opt" data-i="${i}" rows="4">${escapeHtml(d.optionsText)}</textarea>
            <label>Правильный вариант</label>
            <select data-f="correct" data-i="${i}"></select>
          `;
          const sel = block.querySelector("select") as HTMLSelectElement;
          const opts = d.optionsText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          opts.forEach((o, j) => {
            const op = document.createElement("option");
            op.value = String(j);
            op.textContent = o.slice(0, 80) + (o.length > 80 ? "…" : "");
            sel.append(op);
          });
          sel.value = String(Math.min(d.correctIndex, Math.max(0, opts.length - 1)));

          block.querySelectorAll<HTMLTextAreaElement>("textarea").forEach((ta) => {
            ta.addEventListener("input", () => {
              const idx = Number(ta.dataset.i);
              if (ta.dataset.f === "text") drafts[idx].text = ta.value;
              else {
                drafts[idx].optionsText = ta.value;
                renderQuestions();
              }
            });
          });
          sel.addEventListener("change", () => {
            drafts[Number(sel.dataset.i)].correctIndex = Number(sel.value);
          });
          block.querySelector("button[data-idx]")?.addEventListener("click", () => {
            drafts.splice(i, 1);
            renderQuestions();
          });
          host.append(block);
        });
      }

      form.querySelector("#qz-add-q")?.addEventListener("click", () => {
        drafts.push({
          text: "",
          optionsText: "Да\nНет\nНе знаю",
          correctIndex: 0,
        });
        renderQuestions();
      });
      renderQuestions();

      form.querySelector("#qz-save")?.addEventListener("click", async () => {
        const errEl = form.querySelector("#qz-err") as HTMLDivElement;
        errEl.hidden = true;
        const title = (form.querySelector("#qz-title") as HTMLInputElement).value.trim();
        const description = (form.querySelector("#qz-desc") as HTMLInputElement).value.trim() || undefined;
        const maxStars = Number((form.querySelector("#qz-stars") as HTMLInputElement).value) || 10;
        const partialRaw = (form.querySelector("#qz-partial") as HTMLInputElement).value.trim();
        const partialStars =
          partialRaw === "" ? undefined : Math.min(maxStars, Math.max(0, Number(partialRaw)));
        if (!title) {
          errEl.textContent = "Укажите название";
          errEl.hidden = false;
          return;
        }
        const questions: { id: string; text: string; options: string[]; correctIndex: number }[] = [];
        for (let i = 0; i < drafts.length; i++) {
          const d = drafts[i];
          const options = d.optionsText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          if (!d.text.trim() || options.length < 2) {
            errEl.textContent = `Заполните вопрос ${i + 1} и минимум 2 варианта`;
            errEl.hidden = false;
            return;
          }
          const correctIndex = Math.max(0, Math.min(options.length - 1, d.correctIndex));
          questions.push({
            id: `q${i + 1}-${Date.now()}`,
            text: d.text.trim(),
            options,
            correctIndex,
          });
        }
        try {
          await api("/api/quizzes", {
            method: "POST",
            body: JSON.stringify({
              title,
              description,
              maxStars,
              partialStars: partialStars ?? null,
              questions,
            }),
          });
          teacherTab = "quizzes";
          mountTeacherDesk(app, me, rerender);
        } catch (ex) {
          errEl.textContent = String(ex);
          errEl.hidden = false;
        }
      });

      body.append(form);
    }

    if (teacherTab === "students") {
      let students: StudentRow[] = [];
      try {
        students = await api<StudentRow[]>("/api/teachers/my/students");
      } catch {
        body.append(el(`<p class="error">Не удалось загрузить учеников</p>`));
      }

      const linkCard = el(`<div class="card"></div>`);
      linkCard.innerHTML = `
        <h3>Закрепить ученика</h3>
        <p class="sub">Вставьте ID из профиля ученика (раздел «Профиль» в приложении ученика).</p>
        <label>Student ID</label>
        <input type="text" id="link-sid" placeholder="cuid…" autocomplete="off" />
        <button type="button" class="btn secondary" id="link-go">Закрепить</button>
        <div class="error" id="link-err" hidden></div>
      `;
      linkCard.querySelector("#link-go")?.addEventListener("click", async () => {
        const id = (linkCard.querySelector("#link-sid") as HTMLInputElement).value.trim();
        const err = linkCard.querySelector("#link-err") as HTMLDivElement;
        err.hidden = true;
        if (!id) {
          err.textContent = "Укажите ID";
          err.hidden = false;
          return;
        }
        try {
          await api("/api/teachers/link", { method: "POST", body: JSON.stringify({ studentId: id }) });
          mountTeacherDesk(app, me, rerender);
        } catch (e) {
          err.textContent = String(e);
          err.hidden = false;
        }
      });
      body.append(linkCard);

      let quizzes: QuizRow[] = [];
      try {
        quizzes = await api<QuizRow[]>("/api/quizzes/mine");
      } catch {
        /* */
      }

      if (!students.length) {
        body.append(el(`<p class="sub">Закреплённых учеников пока нет.</p>`));
      }

      students.forEach((s) => {
        const row = el(`<div class="card assign-card"></div>`);
        row.innerHTML = `
          <div class="assign-head">
            <div>
              <strong>${escapeHtml(s.name)}</strong>
              <p class="sub">${escapeHtml(s.email)}</p>
              <p class="sub mono">id: ${s.id}</p>
            </div>
            <span class="chip">${s.starsTotal} ★</span>
          </div>
          <label>Квиз для назначения</label>
          <select class="assign-select" data-student="${s.id}">
            <option value="">— выберите квиз —</option>
            ${quizzes.map((q) => `<option value="${q.id}">${escapeHtml(q.title)}</option>`).join("")}
          </select>
          <button type="button" class="btn secondary assign-btn" data-student="${s.id}">Назначить</button>
          <div class="assign-msg sub" data-student="${s.id}" hidden></div>
        `;
        row.querySelector(".assign-btn")?.addEventListener("click", async () => {
          const sel = row.querySelector<HTMLSelectElement>(".assign-select");
          const msg = row.querySelector<HTMLElement>(".assign-msg");
          if (!sel?.value) {
            msg!.textContent = "Выберите квиз";
            msg!.hidden = false;
            return;
          }
          msg!.hidden = true;
          try {
            await api(`/api/quizzes/${sel.value}/assign`, {
              method: "POST",
              body: JSON.stringify({ studentId: s.id }),
            });
            msg!.textContent = "Назначено";
            msg!.style.color = "var(--success)";
            msg!.hidden = false;
          } catch (e) {
            msg!.textContent = String(e);
            msg!.hidden = false;
          }
        });
        body.append(row);
      });
    }
  })().then(() => {
    const layout = el(`<div class="teacher-layout"></div>`);
    layout.append(sidebar, el(`<div class="teacher-content"></div>`));
    layout.querySelector(".teacher-content")!.append(header, body);
    app.append(layout);
  });
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function initials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const a = parts[0]?.[0] ?? "T";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return (a + b).toUpperCase();
}

function sideIcon(name: string): string {
  switch (name) {
    case "dash":
      return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 13h8V3H3v10Z"></path><path d="M13 21h8V11h-8v10Z"></path><path d="M13 3h8v6h-8V3Z"></path><path d="M3 17h8v4H3v-4Z"></path></svg>`;
    case "book":
      return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z"></path></svg>`;
    case "layers":
      return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 2 7l10 5 10-5-10-5Z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>`;
    case "lesson":
      return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"></path><path d="M8 2v4"></path><path d="M16 2v4"></path><path d="M4 10h16"></path></svg>`;
    case "quiz":
      return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"></path><path d="M7 8h10"></path><path d="M7 12h6"></path><path d="M7 16h8"></path></svg>`;
    case "hw":
      return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6l1 2h4v16H4V5h4l1-2Z"></path><path d="M9 12h6"></path><path d="M9 16h6"></path></svg>`;
    case "users":
    default:
      return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.9"></path><path d="M16 3.1a4 4 0 0 1 0 7.8"></path></svg>`;
  }
}

function kpiIcon(kind: "courses" | "modules" | "lessons" | "students"): string {
  switch (kind) {
    case "courses":
      return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z"></path></svg>`;
    case "modules":
      return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 2 7l10 5 10-5-10-5Z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>`;
    case "lessons":
      return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"></path><path d="M8 2v4"></path><path d="M16 2v4"></path><path d="M4 10h16"></path></svg>`;
    case "students":
    default:
      return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.9"></path><path d="M16 3.1a4 4 0 0 1 0 7.8"></path></svg>`;
  }
}
