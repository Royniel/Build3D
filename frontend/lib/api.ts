import { cookies } from "next/headers";

import type {
  AuditEntry,
  Machine,
  Me,
  Order,
  Paginated,
  Part,
  PublicStats,
  Quote,
} from "./types";

export const TOKEN_COOKIE = "b3d_token";

const DJANGO = process.env.DJANGO_INTERNAL_URL ?? "http://localhost:8000";
const QUOTING = process.env.QUOTING_INTERNAL_URL ?? "http://localhost:8001";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly body: unknown = null,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

async function readToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(TOKEN_COOKIE)?.value ?? null;
}

function extractDetail(body: unknown, status: number): string {
  if (typeof body === "string" && body) return body;
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;

    const first = Object.entries(record)[0];
    if (first) {
      const [field, value] = first;
      const text = Array.isArray(value) ? value.join(" ") : String(value);
      return `${field}: ${text}`;
    }
  }
  return `Request failed with status ${status}.`;
}

interface RequestOptions {
  method?: string;
  body?: unknown;

  auth?: boolean;

  revalidate?: number | false;
  base?: string;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = "GET",
    body,
    auth = true,
    revalidate = false,
    base = DJANGO,
  } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (auth) {
    const token = await readToken();
    if (!token) throw new ApiError(401, "Not signed in.");
    headers.Authorization = `Token ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),

      cache: revalidate === false ? "no-store" : "force-cache",
      next: revalidate === false ? undefined : { revalidate },
    });
  } catch (cause) {
    throw new ApiError(503, `Cannot reach ${base}.`, cause);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractDetail(parsed, response.status),
      parsed,
    );
  }
  return parsed as T;
}

export function getPublicStats(): Promise<PublicStats> {
  return request<PublicStats>("/api/public/stats/", { auth: false });
}

export function getMaterialRates(): Promise<
  Record<string, { rate_per_cm3: number; extra_lead_days: number }>
> {
  return request("/materials", { auth: false, base: QUOTING, revalidate: 300 });
}

export interface QuoteInput {
  material: string;
  quantity: number;
  length_mm: number;
  width_mm: number;
  height_mm: number;
}

export function requestQuote(input: QuoteInput): Promise<Quote> {
  return request<Quote>("/quote", {
    method: "POST",
    body: input,
    auth: false,
    base: QUOTING,
  });
}

export async function getServiceHealth(): Promise<{
  django: boolean;
  quoting: boolean;
}> {
  const [django, quoting] = await Promise.all([
    request("/api/public/stats/", { auth: false })
      .then(() => true)
      .catch(() => false),
    request("/health", { auth: false, base: QUOTING })
      .then(() => true)
      .catch(() => false),
  ]);
  return { django, quoting };
}

export function getMe(): Promise<Me> {
  return request<Me>("/api/me/");
}

export function getOrders(
  params: Record<string, string> = {},
): Promise<Paginated<Order>> {
  const query = new URLSearchParams({ page_size: "100", ...params });
  return request<Paginated<Order>>(`/api/orders/?${query}`);
}

export function getOrder(id: number | string): Promise<Order> {
  return request<Order>(`/api/orders/${id}/`);
}

export function getOrderAudit(id: number | string): Promise<AuditEntry[]> {
  return request<AuditEntry[]>(`/api/orders/${id}/audit/`);
}

export function getMachines(): Promise<Paginated<Machine>> {
  return request<Paginated<Machine>>("/api/machines/?page_size=100");
}

export function getParts(): Promise<Paginated<Part>> {
  return request<Paginated<Part>>("/api/parts/?page_size=100");
}

export function getRecentAudit(limit = 12): Promise<Paginated<AuditEntry>> {
  return request<Paginated<AuditEntry>>(`/api/audit-logs/?page_size=${limit}`);
}

export function postTransition(
  id: number,
  payload: { to_status: string; note?: string; machine?: number | null },
): Promise<Order> {
  return request<Order>(`/api/orders/${id}/transition/`, {
    method: "POST",
    body: payload,
  });
}

export function postRequote(id: number): Promise<Order> {
  return request<Order>(`/api/orders/${id}/requote/`, { method: "POST" });
}

export function postOrder(payload: {
  part: number;
  customer?: number | null;
}): Promise<Order> {
  return request<Order>("/api/orders/", { method: "POST", body: payload });
}

export function postPart(payload: {
  name: string;
  material: string;
  quantity: number;
  length_mm: string;
  width_mm: string;
  height_mm: string;
}): Promise<Part> {
  return request<Part>("/api/parts/", { method: "POST", body: payload });
}

export async function exchangeCredentialsForToken(
  username: string,
  password: string,
): Promise<string> {
  const body = await request<{ token: string }>("/api/auth/token/", {
    method: "POST",
    body: { username, password },
    auth: false,
  });
  return body.token;
}
