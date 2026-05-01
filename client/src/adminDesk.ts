import { api, setToken } from "./api.js";
import type { Me } from "./portals.js";

function el(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

type ATab =
  | "students"
  | "courses"
  | "teachers"
  | "requests"
  | "notifications"
  | "levels"
  | "achievements";

let adminTab: ATab = "students";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  starsTotal: number;
  createdAt: string;
};

type LevelRow = {
  id: number;
  number: number;
  name: string;
  description: string;
  minStars: number;
  maxStars: number;
  imageUrl?: string;
};

let levels: LevelRow[] = [
  {
    id: 6,
    number: 1,
    name: "Новичок/Бронза I",
    description: "Добро пожаловать в Study Task! Ты сделал первы…",
    minStars: 0,
    maxStars: 10,
    imageUrl: "/static/images/st.logo.webp",
  },
];

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function modal(html: string): HTMLElement {
  const m = el(`<div class="adm-modal-overlay" role="dialog" aria-modal="true"></div>`);
  m.innerHTML = `<div class="adm-modal">${html}</div>`;
  m.addEventListener("click", (e) => {
    if (e.target === m) m.remove();
  });
  return m;
}

export function mountAdminDesk(
  app: HTMLElement,
  me: Me,
  rerender: () => void
): void {
  app.className = "admin-shell";
  app.innerHTML = "";

  const top = el(`<header class="admin-topbar">
    <div class="admin-top-left">
      <div class="admin-gear" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"></path>
          <path d="M19.4 15a7.8 7.8 0 0 0 .1-1l2-1.5-2-3.5-2.4.6a7.6 7.6 0 0 0-1.7-1L15 6h-6l-.4 2.6a7.6 7.6 0 0 0-1.7 1L4.5 9 2.5 12.5l2 1.5a7.8 7.8 0 0 0 .1 1L2.5 16.5 4.5 20l2.4-.6a7.6 7.6 0 0 0 1.7 1L9 22h6l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.4.6 2-3.5-2-1.5Z"></path>
        </svg>
      </div>
      <h1 class="admin-title">Админ Панель</h1>
    </div>
    <button type="button" class="admin-logout" id="a-logout">
      <span aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 17l5-5-5-5"></path>
          <path d="M15 12H3"></path>
          <path d="M21 3v18"></path>
        </svg>
      </span>
      Выйти
    </button>
  </header>`);
  top.querySelector("#a-logout")?.addEventListener("click", () => {
    setToken(null);
    rerender();
  });

  const tabs = el(`<nav class="admin-tabs" aria-label="Разделы админ панели"></nav>`);
  const tabDef: { id: ATab; label: string; icon: string }[] = [
    { id: "students", label: "Студенты", icon: "users" },
    { id: "courses", label: "Курсы", icon: "book" },
    { id: "teachers", label: "Преподаватели", icon: "cap" },
    { id: "requests", label: "Запросы", icon: "mail" },
    { id: "notifications", label: "Уведомления", icon: "bell" },
    { id: "levels", label: "Уровни", icon: "star" },
    { id: "achievements", label: "Достижения", icon: "trophy" },
  ];

  function iconSvg(name: string): string {
    switch (name) {
      case "users":
        return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.9"></path><path d="M16 3.1a4 4 0 0 1 0 7.8"></path></svg>`;
      case "book":
        return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z"></path></svg>`;
      case "cap":
        return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10L12 5 2 10l10 5 10-5Z"></path><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"></path></svg>`;
      case "mail":
        return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"></path><path d="m22 6-10 7L2 6"></path></svg>`;
      case "bell":
        return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"></path><path d="M13.7 21a2 2 0 0 1-3.4 0"></path></svg>`;
      case "star":
        return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.1 6.3L22 9.3l-5 4.9L18.2 22 12 18.7 5.8 22 7 14.2 2 9.3l6.9-1L12 2z"></path></svg>`;
      case "trophy":
      default:
        return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M17 4V2H7v2"></path><path d="M7 4v5a5 5 0 0 0 10 0V4"></path><path d="M5 5H3v2a4 4 0 0 0 4 4"></path><path d="M19 5h2v2a4 4 0 0 1-4 4"></path></svg>`;
    }
  }

  tabDef.forEach((t) => {
    const b = el(
      `<button type="button" class="admin-tab ${adminTab === t.id ? "active" : ""}">
        <span class="ico" aria-hidden="true">${iconSvg(t.icon)}</span>
        ${t.label}
      </button>`
    );
    b.addEventListener("click", () => {
      adminTab = t.id;
      mountAdminDesk(app, me, rerender);
    });
    tabs.append(b);
  });

  const body = el(`<main class="admin-main"></main>`);

  void (async () => {
    if (adminTab === "students") {
      const searchCard = el(`<div class="admin-card"></div>`);
      searchCard.innerHTML = `
        <div class="admin-card-head">
          <h2>Список студентов</h2>
        </div>
        <div class="admin-search">
          <input type="search" id="adm-q" placeholder="Поиск…" />
        </div>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Имя</th>
                <th>Email</th>
                <th>Роль</th>
                <th>Звёзды</th>
              </tr>
            </thead>
            <tbody id="adm-users"></tbody>
          </table>
        </div>
      `;
      const listHost = searchCard.querySelector("#adm-users")!;
      const input = searchCard.querySelector("#adm-q") as HTMLInputElement;

      async function runSearch(): Promise<void> {
        const q = input.value.trim();
        listHost.innerHTML = "";
        try {
          const users = await api<UserRow[]>(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`);
          const filtered = users.filter((u) => String(u.role) === "STUDENT");
          if (!filtered.length) {
            listHost.append(el(`<tr><td colspan="5" class="admin-empty">Ничего не найдено</td></tr>`));
            return;
          }
          filtered.forEach((u) => {
            listHost.append(
              el(`<tr>
                <td class="mono">${escapeHtml(u.id)}</td>
                <td><strong>${escapeHtml(u.name)}</strong></td>
                <td>${escapeHtml(u.email)}</td>
                <td>${escapeHtml(u.role)}</td>
                <td><span class="admin-chip">${u.starsTotal} ★</span></td>
              </tr>`)
            );
          });
        } catch (e) {
          listHost.append(el(`<tr><td colspan="5" class="admin-empty">${escapeHtml(String(e))}</td></tr>`));
        }
      }

      let t: ReturnType<typeof setTimeout> | undefined;
      input.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(runSearch, 320);
      });
      await runSearch();
      body.append(searchCard);
      return;
    }

    if (adminTab === "teachers") {
      const card = el(`<div class="adm-panel"></div>`);
      card.innerHTML = `
        <div class="adm-panel-head">
          <div class="adm-panel-title"><span class="adm-panel-ico">👨‍🏫</span> Управление преподавателями</div>
          <button type="button" class="adm-btn add" id="adm-add-teacher">+ Добавить преподавателя</button>
        </div>
        <div class="adm-panel-body">
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead>
                <tr>
                  <th>Фото</th>
                  <th>Имя</th>
                  <th>Email</th>
                  <th>Телефон</th>
                  <th>Специализация</th>
                  <th>Курсы</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody id="adm-teachers"></tbody>
            </table>
          </div>
        </div>
      `;

      const host = card.querySelector("#adm-teachers") as HTMLElement;
      try {
        const users = await api<UserRow[]>("/api/admin/users");
        const teachers = users.filter((u) => String(u.role) === "TEACHER");
        if (!teachers.length) {
          host.append(el(`<tr><td colspan="8" class="admin-empty">Нет преподавателей</td></tr>`));
        } else {
          teachers.forEach((t, idx) => {
            const avatar = initials(t.name);
            host.append(
              el(`<tr>
                <td><div class="adm-avatar">${escapeHtml(avatar)}</div></td>
                <td>${escapeHtml(t.name)}</td>
                <td>${escapeHtml(t.email)}</td>
                <td>${idx === 0 ? "87717515167" : "—"}</td>
                <td>Математика</td>
                <td>0</td>
                <td><span class="adm-badge ok">Активен</span></td>
                <td>
                  <div class="adm-actions">
                    <button type="button" class="adm-btn warn">Деактивировать</button>
                    <button type="button" class="adm-btn danger">Удалить</button>
                  </div>
                </td>
              </tr>`)
            );
          });
        }
      } catch (e) {
        host.append(el(`<tr><td colspan="8" class="admin-empty">${escapeHtml(String(e))}</td></tr>`));
      }

      card.querySelector("#adm-add-teacher")?.addEventListener("click", () => {
        const m = modal(`
          <div class="adm-modal-head">
            <div class="adm-modal-title">Добавить преподавателя</div>
            <button type="button" class="adm-modal-x" aria-label="Закрыть">×</button>
          </div>
          <div class="adm-modal-body">
            <label>Имя</label><input type="text" placeholder="Имя преподавателя" />
            <label>Email</label><input type="email" placeholder="Email" />
            <label>Телефон</label><input type="text" placeholder="Телефон" />
            <label>Специализация</label><input type="text" placeholder="Например: Математика" />
          </div>
          <div class="adm-modal-foot">
            <button type="button" class="adm-btn ghost" data-close>Отмена</button>
            <button type="button" class="adm-btn add" data-close>Добавить</button>
          </div>
        `);
        m.querySelector(".adm-modal-x")?.addEventListener("click", () => m.remove());
        m.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => m.remove()));
        document.body.append(m);
      });

      body.append(card);
      return;
    }

    if (adminTab === "levels") {
      const total = levels.length;
      const minFirst = total ? Math.min(...levels.map((l) => l.minStars)) : 0;
      const maxLast = total ? Math.max(...levels.map((l) => l.maxStars)) : 0;

      const kpis = el(`<div class="adm-kpis"></div>`);
      kpis.append(
        el(`<div class="adm-kpi"><div class="adm-kpi-val">${total}</div><div class="adm-kpi-lbl">Всего уровней</div></div>`)
      );
      kpis.append(
        el(`<div class="adm-kpi"><div class="adm-kpi-val">${minFirst}</div><div class="adm-kpi-lbl">Мин. звезд для 1 уровня</div></div>`)
      );
      kpis.append(
        el(`<div class="adm-kpi"><div class="adm-kpi-val">${maxLast}</div><div class="adm-kpi-lbl">Макс. звезд для последнего</div></div>`)
      );

      const card = el(`<div class="adm-panel"></div>`);
      card.innerHTML = `
        <div class="adm-panel-head">
          <div class="adm-panel-title"><span class="adm-panel-ico">⭐</span> Управление уровнями</div>
          <button type="button" class="adm-btn add" id="adm-add-level">+ Добавить уровень</button>
        </div>
        <div class="adm-panel-body">
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Изображение</th>
                  <th>Номер</th>
                  <th>Название</th>
                  <th>Описание</th>
                  <th>Мин. звезд</th>
                  <th>Макс. звезд</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody id="adm-levels"></tbody>
            </table>
          </div>
        </div>
      `;

      const host = card.querySelector("#adm-levels") as HTMLElement;
      const renderLevels = (): void => {
        host.innerHTML = "";
        if (!levels.length) {
          host.append(el(`<tr><td colspan="8" class="admin-empty">Уровней пока нет</td></tr>`));
          return;
        }
        levels.forEach((l) => {
          host.append(
            el(`<tr>
              <td>${l.id}</td>
              <td><img class="adm-level-img" src="${escapeHtml(l.imageUrl || "/static/images/st.logo.webp")}" alt="" /></td>
              <td>${l.number}</td>
              <td>${escapeHtml(l.name)}</td>
              <td>${escapeHtml(l.description)}</td>
              <td>${l.minStars}</td>
              <td>${l.maxStars}</td>
              <td>
                <div class="adm-icon-actions">
                  <button type="button" class="adm-icon-btn warn" title="Редактировать">✎</button>
                  <button type="button" class="adm-icon-btn info" title="Просмотр">👁</button>
                  <button type="button" class="adm-icon-btn danger" title="Удалить">🗑</button>
                </div>
              </td>
            </tr>`)
          );
        });
      };
      renderLevels();

      card.querySelector("#adm-add-level")?.addEventListener("click", () => {
        const m = modal(`
          <div class="adm-modal-head">
            <div class="adm-modal-title">Добавить уровень</div>
            <button type="button" class="adm-modal-x" aria-label="Закрыть">×</button>
          </div>
          <div class="adm-modal-body">
            <label>Номер уровня</label><input type="number" id="lv-num" />
            <label>Название</label><input type="text" id="lv-name" />
            <label>Описание</label><textarea rows="4" id="lv-desc"></textarea>
            <label>Минимальное количество звезд</label><input type="number" id="lv-min" />
            <label>Максимальное количество звезд</label><input type="number" id="lv-max" />
            <label>Изображение уровня</label>
            <input type="file" id="lv-file" />
          </div>
          <div class="adm-modal-foot">
            <button type="button" class="adm-btn ghost" data-close>Отмена</button>
            <button type="button" class="adm-btn add" id="lv-add">Добавить</button>
          </div>
        `);
        const close = (): void => m.remove();
        m.querySelector(".adm-modal-x")?.addEventListener("click", close);
        m.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
        (m.querySelector("#lv-add") as HTMLButtonElement).addEventListener("click", () => {
          const num = Number((m.querySelector("#lv-num") as HTMLInputElement).value || "0");
          const name = (m.querySelector("#lv-name") as HTMLInputElement).value.trim() || "Уровень";
          const desc = (m.querySelector("#lv-desc") as HTMLTextAreaElement).value.trim() || "";
          const min = Number((m.querySelector("#lv-min") as HTMLInputElement).value || "0");
          const max = Number((m.querySelector("#lv-max") as HTMLInputElement).value || "0");
          const id = Math.max(0, ...levels.map((x) => x.id)) + 1;
          levels = [
            ...levels,
            {
              id,
              number: num,
              name,
              description: desc,
              minStars: min,
              maxStars: max,
              imageUrl: "/static/images/st.logo.webp",
            },
          ];
          renderLevels();
          close();
        });
        document.body.append(m);
      });

      body.append(kpis, card);
      return;
    }

    body.append(
      el(`<div class="admin-card">
        <div class="admin-card-head">
          <h2>${escapeHtml(
            tabDef.find((t) => t.id === adminTab)?.label ?? "Раздел"
          )}</h2>
        </div>
        <p class="admin-soon">Раздел в разработке. Сейчас работает список студентов и преподавателей.</p>
      </div>`)
    );
  })().then(() => {
    app.append(top, tabs, body);
  });
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
