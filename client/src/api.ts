/** База URL API: в dev по умолчанию напрямую на Express (обходит сбои Vite proxy). */
function apiBase(): string {
  const fromEnv = import.meta.env.VITE_API_URL as string | undefined;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.DEV) return "http://localhost:3001";
  return "";
}

export function getToken(): string | null {
  return localStorage.getItem("st_token");
}

export function setToken(t: string | null): void {
  if (t) localStorage.setItem("st_token", t);
  else localStorage.removeItem("st_token");
}

export async function api<T>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const base = apiBase();
  const url = path.startsWith("http") ? path : `${base}${path}`;

  const headers = new Headers(opts.headers);
  if (opts.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const tok = getToken();
  if (tok) headers.set("Authorization", `Bearer ${tok}`);

  const r = await fetch(url, { ...opts, headers });
  const text = await r.text();
  const ct = r.headers.get("content-type") || "";

  let data: unknown = null;
  if (text) {
    if (ct.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        data = null;
      }
    }
  }

  if (ct.includes("text/html") || (text && text.trim().startsWith("<!"))) {
    throw new Error(
      "Сервер вернул HTML вместо API. Запустите бэкенд в корне: `npm run dev` (по умолчанию порт 3001; см. .env PORT и VITE_API_URL)."
    );
  }

  if (!r.ok) {
    const err = data as { error?: string } | null;
    throw new Error(err?.error || r.statusText || `Ошибка запроса (${r.status})`);
  }

  return data as T;
}
