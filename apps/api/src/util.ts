export const uid = (prefix: string): string => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`;
export const nowIso = (): string => new Date().toISOString();

export class ApiErr extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const payloadHashOf = (payload: unknown): Promise<string> => sha256Hex(canonicalJson(payload));

export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

export async function bearerOk(req: Request, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  const h = req.headers.get("authorization") ?? "";
  if (!h.toLowerCase().startsWith("bearer ")) return false;
  return safeEqual(h.slice(7).trim(), secret);
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}…` : s);

export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
