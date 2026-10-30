// Safe public-page fetch for Scout's competitor research: GET only, http(s), no private hosts,
// 3 redirects max (each re-validated), 8 s timeout, 512 KB body cap, text extraction.
import { IntegrationError } from "./env";

const MAX_BYTES = 512 * 1024;
const MAX_TEXT = 12_000;
const MAX_REDIRECTS = 3;
const TEXTY = /^(text\/|application\/(xhtml\+xml|json|xml|rss\+xml|atom\+xml))/i;

export function assertPublicUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new IntegrationError("Invalid URL", "bad_url"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new IntegrationError("Only http(s) URLs are allowed", "bad_url");
  if (u.username || u.password) throw new IntegrationError("URLs with credentials are not allowed", "bad_url");
  if (u.port && u.port !== "80" && u.port !== "443") throw new IntegrationError("Only default ports are allowed", "bad_url");
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateV4 = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|192\.0\.0\.|198\.1[89]\.)/;
  const bad =
    h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") ||
    h.endsWith(".lan") || h.endsWith(".home.arpa") || !h.includes(".") && !h.includes(":") ||
    privateV4.test(h) || h === "::1" || h === "::" || /^(fc|fd|fe80)/.test(h) || h.startsWith("::ffff:") ||
    /^\d+$/.test(h) || /^0x/i.test(h);
  if (bad) throw new IntegrationError("That host is not a public website", "bad_url");
  return u;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "-", ndash: "-", hellip: "..." };
const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

export function extractText(html: string): { title: string; description: string; text: string } {
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim());
  const meta = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*>/i)?.[0] ?? "";
  const description = decode(meta.match(/content=["']([^"']*)["']/i)?.[1] ?? "");
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|section|li|h[1-6]|tr|br|article|header|footer)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decode(body).replace(/[ \t\f\v\r]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { title, description, text };
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const buf = new Uint8Array(Math.min(total, MAX_BYTES));
  let off = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, buf.byteLength - off);
    buf.set(c.subarray(0, take), off);
    off += take;
    if (off >= buf.byteLength) break;
  }
  return new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(buf);
}

export async function webFetch(args: unknown): Promise<Record<string, unknown>> {
  const url = typeof (args as any)?.url === "string" ? (args as any).url : "";
  let current = assertPublicUrl(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: ctl.signal,
        headers: { "user-agent": "OpenHQ-Scout/1.0 (+https://openhq.pages.dev)", accept: "text/html,text/plain,application/json;q=0.8,*/*;q=0.1" },
      });
    } catch {
      throw new IntegrationError("Could not fetch that page", "fetch_failed");
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new IntegrationError("Redirect without a location", "fetch_failed");
      current = assertPublicUrl(new URL(loc, current).toString());
      continue;
    }
    const type = res.headers.get("content-type") ?? "";
    if (!TEXTY.test(type)) throw new IntegrationError(`Unsupported content type: ${type.split(";")[0] || "unknown"}`, "unsupported_type");
    const raw = await readCapped(res);
    const isHtml = /html/i.test(type);
    const parsed = isHtml ? extractText(raw) : { title: "", description: "", text: raw.trim() };
    return {
      url: current.toString(),
      status: res.status,
      title: parsed.title,
      description: parsed.description,
      text: parsed.text.slice(0, MAX_TEXT),
      truncated: parsed.text.length > MAX_TEXT || raw.length >= MAX_BYTES,
    };
  }
  throw new IntegrationError("Too many redirects", "fetch_failed");
}

export const WEB_FETCH_SCHEMA = {
  type: "object",
  properties: { url: { type: "string", description: "Public http(s) page URL, e.g. a competitor's pricing page" } },
  required: ["url"],
} as const;
