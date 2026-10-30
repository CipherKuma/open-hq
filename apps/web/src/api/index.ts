import type { Api } from "./types";
import { httpApi } from "./http";

export * from "./types";

// The fixture world loads only when VITE_API_MODE=mock (dev). Production uses the live API, no fallback.
let current: Api = httpApi;

export async function initApi(): Promise<Api> {
  if (import.meta.env.VITE_API_MODE === "mock") {
    const mod = await import("./mock/adapter");
    current = mod.mockApi;
  }
  return current;
}

export const api: Api = new Proxy({} as Api, {
  get(_t, key: keyof Api) {
    return current[key];
  },
});
