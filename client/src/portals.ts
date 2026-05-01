import { api, setToken } from "./api.js";

export type Portal = "STUDENT" | "TEACHER" | "ADMIN";

export type Me = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "TEACHER" | "STUDENT";
  starsTotal: number;
  avatarUrl?: string | null;
  about?: string | null;
};

function el(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

const portalMeta: Record<
  Portal,
  { title: string; hint: string; theme: string; accent: string }
> = {
  STUDENT: {
    title: "Ученик",
    hint: "Квизы, квесты, игра, рейтинг",
    theme: "theme-student",
    accent: "var(--accent)",
  },
  TEACHER: {
    title: "Преподаватель",
    hint: "Создание квизов и ученики",
    theme: "theme-teacher",
    accent: "var(--teacher-accent)",
  },
  ADMIN: {
    title: "Администратор",
    hint: "Аналитика и пользователи",
    theme: "theme-admin",
    accent: "var(--admin-accent)",
  },
};

export function renderPortalPicker(
  app: HTMLElement,
  onPick: (p: Portal) => void
): void {
  app.className = "app-portals";
  app.innerHTML = "";
  const wrap = el(`<div class="portal-screen"></div>`);
  wrap.append(
    el(`<header class="portal-hero">
      <div class="logo-mark large">ST</div>
      <h1>Study Task</h1>
      <p class="sub">Выберите тип входа — так мы покажем нужный интерфейс и проверим роль.</p>
    </header>`)
  );
  const grid = el(`<div class="portal-grid"></div>`);
  (["STUDENT", "TEACHER", "ADMIN"] as Portal[]).forEach((p) => {
    const m = portalMeta[p];
    const card = el(`<button type="button" class="portal-card ${m.theme}">
      <span class="portal-card-title">${m.title}</span>
      <span class="portal-card-hint">${m.hint}</span>
      <span class="portal-card-go">Войти →</span>
    </button>`);
    card.addEventListener("click", () => onPick(p));
    grid.append(card);
  });
  wrap.append(grid);
  app.append(wrap);
}

export function renderLoginPage(
  app: HTMLElement,
  portal: Portal,
  onBack: () => void,
  onSuccess: (user: Me) => void
): void {
  app.className = `app-login ${portalMeta[portal].theme}`;
  app.innerHTML = "";
  const meta = portalMeta[portal];
  const screen = el(`<div class="portal-screen narrow"></div>`);

  screen.append(
    el(`<button type="button" class="link-back" aria-label="Назад">← Все роли</button>`)
  );
  screen.querySelector(".link-back")?.addEventListener("click", onBack);

  screen.append(
    el(`<header class="login-head">
      <div class="login-badge" style="--badge:${meta.accent}">${meta.title}</div>
      <h1>Вход</h1>
      <p class="sub">${portal === "ADMIN" ? "Доступ только для учётных записей администратора." : meta.hint}</p>
    </header>`)
  );

  const form = el(`<form class="card glass"></form>`) as HTMLFormElement;
  form.innerHTML = `
    <label>Email</label>
    <input name="email" type="email" autocomplete="username" required />
    <label>Пароль</label>
    <input name="password" type="password" autocomplete="current-password" required />
    ${portal !== "ADMIN" ? `<label>Имя (только регистрация)</label>
    <input name="name" type="text" placeholder="Как к вам обращаться" />` : ""}
    <div class="error" role="alert" hidden></div>
    <button class="btn login-submit" type="submit">Войти</button>
    ${portal !== "ADMIN" ? `<button class="btn secondary" type="button" id="reg">Регистрация</button>` : ""}
  `;

  const showErr = (m: string) => {
    const e = form.querySelector(".error") as HTMLDivElement;
    e.textContent = m;
    e.hidden = !m;
  };

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showErr("");
    const fd = new FormData(form);
    try {
      const data = await api<{ token: string; user: Me }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: fd.get("email"),
          password: fd.get("password"),
          portal,
        }),
      });
      setToken(data.token);
      onSuccess(data.user);
    } catch (ex) {
      showErr(String(ex).replace(/^Error: /, ""));
    }
  });

  form.querySelector("#reg")?.addEventListener("click", async () => {
    showErr("");
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim() || (portal === "TEACHER" ? "Преподаватель" : "Ученик");
    try {
      const data = await api<{ token: string; user: Me }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: fd.get("email"),
          password: fd.get("password"),
          name,
          role: portal === "TEACHER" ? "TEACHER" : "STUDENT",
        }),
      });
      setToken(data.token);
      onSuccess(data.user);
    } catch (ex) {
      showErr(String(ex).replace(/^Error: /, ""));
    }
  });

  if (portal === "ADMIN") {
    screen.append(
      el(`<p class="admin-hint card">Тестовый вход: <strong>admin@studytask.local</strong> / <strong>adminadmin</strong> после <code>npm run db:seed</code>.</p>`)
    );
  }
  if (portal === "TEACHER") {
    screen.append(
      el(`<p class="admin-hint card">Демо-преподаватель: <strong>teacher@studytask.local</strong> / <strong>teacherteacher</strong>.</p>`)
    );
  }

  screen.append(form);
  app.append(screen);
}
