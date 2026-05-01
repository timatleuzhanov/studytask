/** Express 5 может типизировать params как string | string[] */
export function routeParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}
