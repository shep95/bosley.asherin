export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      ...headers,
    },
  });

export const fail = (status: number, error: string, headers: Record<string, string> = {}) => json({ error }, status, headers);

/** reject cross-site writes: only pages on this site may post. */
export function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (!origin) return site === "same-origin";
  return origin === new URL(request.url).origin;
}

export async function readJson(request: Request, maxBytes = 8 * 1024): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("application/json")) throw new Error("type");
  const len = Number(request.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new Error("size");
  const text = await request.text();
  if (text.length > maxBytes) throw new Error("size");
  return JSON.parse(text);
}
