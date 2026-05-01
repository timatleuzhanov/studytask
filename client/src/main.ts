import "./style.css";
import { api, getToken, setToken } from "./api.js";
import {
  type Me,
  type Portal,
  renderLoginPage,
} from "./portals.js";
import { mountTeacherDesk } from "./teacherDesk.js";
import { mountAdminDesk } from "./adminDesk.js";
import { openQuizTaker } from "./quizTake.js";

type Tab = "home" | "rank" | "levels" | "quizzes" | "notify" | "profile";

let me: Me | null = null;
let tab: Tab = "home";
/** Пока не вошли — выбор портала или экран логина */
let pickPortal: Portal | null = null;
let sidebarCollapsed = localStorage.getItem("st_sidebar_collapsed") === "1";
let openedQuizRoute: string | null = null;
type LoginPortal = "STUDENT" | "TEACHER" | "ADMIN";

function el(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

function assignmentStats(a: {
  attempts?: { score: number }[];
  stats?: { bestScore: number; attemptCount?: number; hadPerfectScore?: boolean };
}): { bestScore: number; attemptCount: number; hadPerfectScore: boolean } {
  const attempts = a.attempts ?? [];
  const s = a.stats;
  if (s && typeof s.attemptCount === "number" && typeof s.bestScore === "number") {
    return {
      bestScore: s.bestScore,
      attemptCount: s.attemptCount,
      hadPerfectScore: !!s.hadPerfectScore,
    };
  }
  return {
    bestScore: attempts.length ? Math.max(...attempts.map((x) => x.score)) : 0,
    attemptCount: attempts.length,
    hadPerfectScore: attempts.some((x) => x.score === 100),
  };
}

const icons: Record<Tab, string> = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  quizzes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>`,
  rank: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>`,
  levels: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.1 6.3L22 9.3l-5 4.9L18.2 22 12 18.7 5.8 22 7 14.2 2 9.3l6.9-1L12 2z"/></svg>`,
  notify: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"></path><path d="M13.7 21a2 2 0 0 1-3.4 0"></path></svg>`,
  profile: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
};

const tabLabels: Record<Tab, string> = {
  home: "Главная",
  rank: "Рейтинг",
  levels: "Уровни",
  quizzes: "Квизы",
  notify: "Уведомления",
  profile: "Профиль",
};

function navButton(t: Tab, variant: "sidebar" | "mobile"): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className =
    variant === "sidebar"
      ? `student-sidebar-link ${tab === t ? "active" : ""}`
      : `student-tabbar-btn ${tab === t ? "active" : ""}`;
  b.innerHTML = `${icons[t]}<span>${tabLabels[t]}</span>`;
  b.addEventListener("click", () => {
    tab = t;
    render();
  });
  return b;
}

function getQuizRouteAssignmentId(): string | null {
  const m = window.location.pathname.match(/^\/quiz\/([^/]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function gotoQuizRoute(assignmentId: string): void {
  window.history.pushState({}, "", `/quiz/${assignmentId}`);
}

function gotoAppRoute(path = "/"): void {
  window.history.pushState({}, "", path);
}

function cleanPathname(): string {
  const p = window.location.pathname.replace(/\/+$/, "");
  return p || "/";
}

/** Мобильная нижняя панель */
function studentTabbar(): HTMLElement {
  const n = el(`<nav class="student-tabbar" aria-label="Основное меню"></nav>`);
  (["home", "rank", "levels", "quizzes", "notify"] as Tab[]).forEach((t) => n.append(navButton(t, "mobile")));
  return n;
}

/** Боковое меню (ПК) */
function studentSidebar(_userName: string, _stars: number): HTMLElement {
  const aside = el(`<aside class="student-sidebar" aria-label="Разделы"></aside>`);
  aside.innerHTML = `
    <button type="button" class="student-sidebar-toggle" aria-label="Свернуть/развернуть меню"></button>
    <div class="student-sidebar-head">
      <div class="student-sidebar-logo">
        <span class="student-sidebar-title">STUDY TASK</span>
      </div>
    </div>
    <nav class="student-sidebar-nav"></nav>
  `;
  const nav = aside.querySelector(".student-sidebar-nav") as HTMLElement;
  (["home", "rank", "levels", "quizzes", "notify"] as Tab[]).forEach((t) => nav.append(navButton(t, "sidebar")));
  const prof = navButton("profile", "sidebar");
  prof.classList.add("student-sidebar-link--secondary");
  nav.append(el(`<div class="student-sidebar-sep"></div>`), prof);
  const toggleBtn = aside.querySelector(".student-sidebar-toggle") as HTMLButtonElement;
  const syncToggle = (): void => {
    toggleBtn.textContent = sidebarCollapsed ? "»" : "«";
    toggleBtn.title = sidebarCollapsed ? "Развернуть меню" : "Свернуть меню";
  };
  if (sidebarCollapsed) aside.classList.add("collapsed");
  syncToggle();
  toggleBtn.addEventListener("click", () => {
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem("st_sidebar_collapsed", sidebarCollapsed ? "1" : "0");
    aside.classList.toggle("collapsed", sidebarCollapsed);
    syncToggle();
  });
  return aside;
}

async function loadMe(): Promise<void> {
  try {
    me = await api<Me>("/api/auth/me");
  } catch {
    setToken(null);
    me = null;
  }
}

async function renderStudentHome(): Promise<HTMLElement> {
  const wrap = el(`<div class="student-home"></div>`);
  if (!me) return wrap;
  wrap.append(
    el(`<div class="st-main-cards">
      <button type="button" class="st-card st-card--rating" data-go="rank">
        <div class="st-card-ico">🏆</div>
        <div class="st-card-title">Рейтинг</div>
        <div class="st-card-sub">Соревнуйтесь с другими студентами и поднимайтесь в рейтинге</div>
        <div class="st-card-chip">${me.starsTotal} ☆</div>
        <div class="st-card-arrow">→</div>
      </button>
      <button type="button" class="st-card st-card--levels" data-go="levels">
        <div class="st-card-ico">🎖</div>
        <div class="st-card-title">Уровни</div>
        <div class="st-card-sub">Повышайте свой уровень и получайте новые возможности</div>
        <div class="st-card-chip">Уровень 1</div>
        <div class="st-card-arrow">→</div>
      </button>
      <button type="button" class="st-card st-card--quizzes" data-go="quizzes">
        <div class="st-card-ico">🧠</div>
        <div class="st-card-title">Квизы</div>
        <div class="st-card-sub">Проверяйте свои знания и зарабатывайте звезды</div>
        <div class="st-card-chip">0 доступно</div>
        <div class="st-card-arrow">→</div>
      </button>
      <button type="button" class="st-card st-card--notify" data-go="notify">
        <div class="st-card-ico">🔔</div>
        <div class="st-card-title">Уведомления</div>
        <div class="st-card-sub">Следите за важными обновлениями и новостями</div>
        <div class="st-card-chip">0 новых</div>
        <div class="st-card-arrow">→</div>
      </button>
    </div>`)
  );
  wrap.querySelectorAll<HTMLElement>("[data-go]").forEach((b) => {
    b.addEventListener("click", () => {
      tab = b.dataset.go as Tab;
      render();
    });
  });
  return wrap;
}

async function renderLevels(): Promise<HTMLElement> {
  const wrap = el(`<div class="st-levels"></div>`);
  if (!me) return wrap;
  wrap.append(
    el(`<div class="st-levels-head">
      <h2><span class="cup">🏆</span> Ваш прогресс по уровням</h2>
      <p>Зарабатывайте звезды, проходя квизы, и повышайте свой уровень!</p>
    </div>`)
  );
  wrap.append(
    el(`<div class="st-level-card">
      <div class="st-level-left">
        <div class="st-level-num">1</div>
      </div>
      <div class="st-level-mid">
        <div class="st-level-title">Новичок/Бронза I</div>
        <div class="st-level-sub">Ваш текущий уровень</div>
        <div class="st-level-stars">⭐ ${me.starsTotal} звезд</div>
        <div class="st-level-progress">
          <div class="st-level-progress-label">Прогресс до следующего уровня</div>
          <div class="st-level-bar"><div class="st-level-bar-fill" style="width: 100%"></div></div>
          <div class="st-level-bar-meta"><span>Нужно еще 0 звезд для достижения следующего уровня</span><strong>100%</strong></div>
        </div>
      </div>
      <div class="st-level-right">
        <img src="/static/images/st.logo.webp" alt="" />
      </div>
    </div>`)
  );
  return wrap;
}

async function renderNotify(): Promise<HTMLElement> {
  const wrap = el(`<div class="card"></div>`);
  wrap.innerHTML = `<h3>Уведомления</h3><p class="sub">Пока уведомлений нет.</p>`;
  return wrap;
}

async function renderQuizzes(): Promise<HTMLElement> {
  const wrap = el(`<div></div>`);
  if (!me) return wrap;
  const assigned = await api<
    {
      id: string;
      quiz: {
        id: string;
        title: string;
        maxStars: number;
        questions?: { id: string; text: string; options: string[] }[];
      };
      attempts?: { score: number; attemptType: string; createdAt: string }[];
      stats?: { bestScore: number; attemptCount: number; hadPerfectScore: boolean };
    }[]
  >("/api/quizzes/assigned");
  assigned.forEach((a) => {
    const attempts = a.attempts ?? [];
    const st = assignmentStats({ attempts, stats: a.stats });
    const last = attempts.length ? attempts[attempts.length - 1] : null;
    const qCount = a.quiz.questions?.length ?? 0;
    const status = !attempts.length
      ? "Не начат"
      : `Попыток: ${st.attemptCount} · лучший ${st.bestScore}% · посл. ${last!.score}%`;
    const btnLabel = !attempts.length ? "Начать квиз" : st.hadPerfectScore ? "Повторить (без звёзд)" : "Пересдать / продолжить";
    const row = el(`<div class="card quiz-card"><h3></h3>
      <p class="sub"></p>
      <p class="sub meta-line"></p>
      <button class="btn secondary quiz-open" type="button"></button></div>`);
    row.querySelector("h3")!.textContent = a.quiz.title;
    (row.querySelector("p.sub") as HTMLElement).textContent = status;
    (row.querySelector(".meta-line") as HTMLElement).textContent = `${qCount} вопр. · до ${a.quiz.maxStars} ☆ за 100%`;
    (row.querySelector(".quiz-open") as HTMLButtonElement).textContent = btnLabel;
    row.querySelector(".quiz-open")?.addEventListener("click", async () => {
      if (!me) return;
      gotoQuizRoute(a.id);
      render();
    });
    wrap.append(row);
  });
  if (!assigned.length) {
    wrap.append(
      el(`<p class="sub">Нет назначенных квизов. Дождитесь закрепления и назначения от преподавателя.</p>`)
    );
  }
  return wrap;
}

// мини-игра скрыта в текущем дизайне студента

async function renderRank(): Promise<HTMLElement> {
  const wrap = el(`<div></div>`);
  const rows = await api<{ rank: number; name: string; starsTotal: number }[]>("/api/ratings/global");
  rows.slice(0, 20).forEach((r) => {
    wrap.append(
      el(`<div class="card list-row"><span><strong>#${r.rank}</strong> ${r.name}</span><strong>${r.starsTotal} ★</strong></div>`)
    );
  });
  return wrap;
}

async function renderProfile(): Promise<HTMLElement> {
  const wrap = el(`<div></div>`);
  if (!me) return wrap;
  const avatar = me.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(me.name)}`;
  wrap.append(el(`<div class="card profile-head">
    <div class="profile-avatar" style="background-image:url('${avatar}')"></div>
    <div>
      <h3>${me.name}</h3>
      <p>${me.email}</p>
      <p class="badge">STUDENT</p>
      <p class="sub mono selectable">id: ${me.id}</p>
    </div>
  </div>`));

  const form = el(`<form class="card"></form>`) as HTMLFormElement;
  form.innerHTML = `
    <label>Email</label>
    <input name="email" type="email" required value="${me.email}" />
    <label>Ссылка на аватар</label>
    <input name="avatarUrl" type="url" placeholder="https://..." value="${me.avatarUrl ?? ""}" />
    <label>Обо мне</label>
    <textarea name="about" rows="4" placeholder="Расскажите о себе...">${me.about ?? ""}</textarea>
    <div class="error" hidden></div>
    <button class="btn" type="submit">Сохранить профиль</button>
    <p class="sub">Имя и фамилия фиксированы и не редактируются.</p>
  `;
  const err = form.querySelector(".error") as HTMLDivElement;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    const fd = new FormData(form);
    try {
      const updated = await api<Me>("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({
          email: String(fd.get("email") || "").trim(),
          avatarUrl: String(fd.get("avatarUrl") || "").trim() || null,
          about: String(fd.get("about") || "").trim() || null,
        }),
      });
      me = updated;
      render();
    } catch (ex) {
      err.textContent = String(ex).replace(/^Error: /, "");
      err.hidden = false;
    }
  });
  wrap.append(form);

  wrap.append(el(`<button class="btn ghost" type="button" id="logout">Выйти</button>`));
  wrap.querySelector("#logout")?.addEventListener("click", () => {
    setToken(null);
    me = null;
    pickPortal = null;
    render();
  });
  return wrap;
}

function mountAiWidget(): void {
  if (!me || me.role !== "STUDENT") return;
  document.querySelector(".ai-widget-root")?.remove();
  const widget = el(`<div class="ai-widget-root">
    <button type="button" class="ai-fab"><span class="ai-dot"></span><span>Чем могу помочь?</span></button>
    <div class="ai-panel hidden">
      <div class="ai-head"><strong>STAI</strong><button type="button" class="ai-close">×</button></div>
      <div class="ai-messages"></div>
      <form class="ai-form">
        <textarea name="message" rows="2" placeholder="Ваш вопрос..."></textarea>
        <button type="submit" class="btn secondary">Отправить</button>
      </form>
    </div>
  </div>`);
  const panel = widget.querySelector(".ai-panel") as HTMLElement;
  const msgBox = widget.querySelector(".ai-messages") as HTMLElement;
  widget.querySelector(".ai-fab")?.addEventListener("click", () => panel.classList.toggle("hidden"));
  widget.querySelector(".ai-close")?.addEventListener("click", () => panel.classList.add("hidden"));
  (widget.querySelector(".ai-form") as HTMLFormElement).addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const text = String(new FormData(form).get("message") || "").trim();
    if (!text) return;
    msgBox.innerHTML += `<p class="ai-msg ai-user">${text}</p>`;
    (form.elements.namedItem("message") as HTMLTextAreaElement).value = "";
    try {
      const r = await api<{ reply: string }>("/api/stai/ask", {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      msgBox.innerHTML += `<p class="ai-msg ai-bot">${r.reply}</p>`;
    } catch (err) {
      msgBox.innerHTML += `<p class="ai-msg ai-err">${String(err)}</p>`;
    }
    msgBox.scrollTop = msgBox.scrollHeight;
  });
  document.body.append(widget);
}

async function renderStudentMain(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.className = "app-student";
  app.innerHTML = "";

  const layout = el(`<div class="student-layout"></div>`);
  const first = me?.name?.split(" ")[0] ?? "";
  layout.append(studentSidebar(me?.name ?? "", me?.starsTotal ?? 0));

  const col = el(`<div class="student-main"></div>`);
  const top = el(`<header class="student-page-head">
    <h1 class="student-page-title"></h1>
    <p class="student-page-sub sub"></p>
  </header>`);
  (top.querySelector(".student-page-title") as HTMLElement).textContent = `Привет, ${first}`;
  (top.querySelector(".student-page-sub") as HTMLElement).textContent =
    tab === "home"
      ? "Кабинет ученика"
      : tab === "rank"
        ? "Рейтинг"
        : tab === "levels"
          ? "Уровни"
          : tab === "quizzes"
            ? "Назначенные квизы"
            : tab === "notify"
              ? "Уведомления"
              : "Профиль и STAI";

  const scroll = el(`<div class="student-scroll"></div>`);
  let body: HTMLElement;
  if (tab === "home") body = await renderStudentHome();
  else if (tab === "rank") body = await renderRank();
  else if (tab === "levels") body = await renderLevels();
  else if (tab === "quizzes") body = await renderQuizzes();
  else if (tab === "notify") body = await renderNotify();
  else body = await renderProfile();

  scroll.append(body);
  col.append(top, scroll, studentTabbar());
  layout.append(col);
  app.append(layout);
  mountAiWidget();

  const quizAssignmentId = getQuizRouteAssignmentId();
  if (quizAssignmentId && openedQuizRoute !== quizAssignmentId && me) {
    openedQuizRoute = quizAssignmentId;
    await openQuizTaker(quizAssignmentId, me, (stars) => {
      if (me) me.starsTotal = stars;
      openedQuizRoute = null;
      gotoAppRoute("/");
      render();
    });
  } else if (!quizAssignmentId) {
    openedQuizRoute = null;
  }
}

function renderGuest(): void {
  document.querySelector(".ai-widget-root")?.remove();
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.className = "app-guest";
  const route = cleanPathname();
  if (
    route === "/login" ||
    route === "/teacher-login" ||
    route === "/admin-login" ||
    route === "/teacher_login" ||
    route === "/admin_login"
  ) {
    const portal: LoginPortal =
      route === "/teacher-login" || route === "/teacher_login"
        ? "TEACHER"
        : route === "/admin-login" || route === "/admin_login"
          ? "ADMIN"
          : "STUDENT";
    const title =
      portal === "STUDENT" ? "Вход для студентов" : portal === "TEACHER" ? "Вход для преподавателей" : "Вход для администраторов";
    const subtitle =
      portal === "STUDENT"
        ? "Войдите в свой аккаунт, чтобы продолжить обучение"
        : portal === "TEACHER"
          ? "Войдите в панель преподавателя"
          : "Доступ только для администраторов";
    app.innerHTML = `
      <div class="student-login-page">
        <div class="student-login-bg"></div>
        <div class="student-login-container">
          <div class="student-login-card">
            <div class="student-login-branding">
              <div class="student-login-logo-wrap">
                <img src="/static/images/st.logo.webp" alt="Study Task" class="student-login-logo" />
              </div>
              <h1 class="student-login-brand">Study Task</h1>
              <p class="student-login-brand-sub">Образовательный центр с геймификацией</p>
              <div class="student-login-features">
                <p><span>🏆</span>Система достижений</p>
                <p><span>⭐</span>Рейтинги и уровни</p>
                <p><span>👥</span>Командные задания</p>
              </div>
            </div>
            <div class="student-login-form-area">
              <h2>${title}</h2>
              <p class="student-login-sub">${subtitle}</p>
              <form id="student-login-form" class="student-login-form">
                <label>Email</label>
                <div class="student-login-input"><span>✉</span><input name="email" type="email" placeholder="Введите email" required /></div>
                <label>Пароль</label>
                <div class="student-login-input password">
                  <span class="pwd-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="5" y="11" width="14" height="10" rx="2"></rect>
                      <path d="M8 11V8a4 4 0 0 1 8 0v3"></path>
                    </svg>
                  </span>
                  <input id="pwd" name="password" type="password" placeholder="Введите пароль" required />
                  <button type="button" id="toggle-pwd" aria-label="Показать пароль">
                    <span class="eye eye-open" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    </span>
                    <span class="eye eye-closed" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 3l18 18"></path>
                        <path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.4"></path>
                        <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a16.8 16.8 0 0 1-3.2 4.2"></path>
                        <path d="M6.3 6.3C3.6 8.1 2 12 2 12s3.5 7 10 7c1 0 2-.2 2.8-.5"></path>
                      </svg>
                    </span>
                  </button>
                </div>
                <div class="error" id="login-err" hidden></div>
                <button type="submit" class="btn student-login-submit">Войти</button>
              </form>
              ${portal === "STUDENT" ? `<p class="student-login-bottom">Нет аккаунта? <a href="#" id="to-register">Зарегистрироваться</a></p>` : ""}
            </div>
          </div>
        </div>
      </div>
    `;
    const toggle = app.querySelector("#toggle-pwd") as HTMLButtonElement | null;
    toggle?.addEventListener("click", () => {
      const inp = app.querySelector("#pwd") as HTMLInputElement;
      const opened = inp.type === "password";
      inp.type = opened ? "text" : "password";
      toggle.classList.toggle("on", opened);
      toggle.setAttribute("aria-label", opened ? "Скрыть пароль" : "Показать пароль");
    });
    (app.querySelector("#student-login-form") as HTMLFormElement).addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget as HTMLFormElement);
      const err = app.querySelector("#login-err") as HTMLDivElement;
      err.hidden = true;
      try {
        const res = await api<{ token: string; user: Me }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: String(fd.get("email") || ""),
            password: String(fd.get("password") || ""),
            portal,
          }),
        });
        setToken(res.token);
        me = res.user;
        gotoAppRoute("/");
        render();
      } catch (ex) {
        err.textContent = String(ex).replace(/^Error: /, "");
        err.hidden = false;
      }
    });
    app.querySelector("#to-register")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const form = app.querySelector("#student-login-form") as HTMLFormElement;
      const fd = new FormData(form);
      const err = app.querySelector("#login-err") as HTMLDivElement;
      err.hidden = true;
      try {
        const res = await api<{ token: string; user: Me }>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email: String(fd.get("email") || ""),
            password: String(fd.get("password") || ""),
            name: "Ученик",
            role: "STUDENT",
          }),
        });
        setToken(res.token);
        me = res.user;
        gotoAppRoute("/");
        render();
      } catch (ex) {
        err.textContent = String(ex).replace(/^Error: /, "");
        err.hidden = false;
      }
    });
    return;
  }

  if (pickPortal === null) {
    app.innerHTML = `<div class="landing-shell"><iframe class="landing-iframe" src="/landing_page.html" title="Study Task Landing"></iframe></div>`;
    return;
  }
  renderLoginPage(
    app,
    pickPortal,
    () => {
      pickPortal = null;
      gotoAppRoute("/");
      render();
    },
    (user) => {
      me = user;
      pickPortal = null;
      gotoAppRoute("/");
      render();
    }
  );
}

export function render(): void {
  if (!getToken()) {
    me = null;
    renderGuest();
    return;
  }
  void loadMe().then(() => {
    if (!me) {
      renderGuest();
      return;
    }
    if (me.role === "TEACHER") {
      document.querySelector(".ai-widget-root")?.remove();
      mountTeacherDesk(document.querySelector("#app")!, me, render);
      return;
    }
    if (me.role === "ADMIN") {
      document.querySelector(".ai-widget-root")?.remove();
      mountAdminDesk(document.querySelector("#app")!, me, render);
      return;
    }
    void renderStudentMain();
  });
}

window.addEventListener("popstate", () => {
  render();
});

render();
