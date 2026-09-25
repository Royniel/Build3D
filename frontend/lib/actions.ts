"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ApiError,
  exchangeCredentialsForToken,
  postOrder,
  postPart,
  postRequote,
  postTransition,
  requestQuote,
  TOKEN_COOKIE,
} from "./api";
import type { ActionResult, QuoteResult } from "./types";

function fail(error: unknown): ActionResult {
  if (error instanceof ApiError) return { ok: false, error: error.detail };
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function login(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { ok: false, error: "Enter both a username and a password." };
  }

  let token: string;
  try {
    token = await exchangeCredentialsForToken(username, password);
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { ok: false, error: "Wrong username or password." };
    }
    if (error instanceof ApiError && error.status === 503) {
      return { ok: false, error: "The order service is not reachable." };
    }
    return fail(error);
  }

  const store = await cookies();
  store.set(TOKEN_COOKIE, token, {
    httpOnly: true, // unreadable from JavaScript
    sameSite: "lax", // survives top-level navigation, blocks cross-site POSTs
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
  redirect("/");
}

export async function transitionOrder(
  orderId: number,
  toStatus: string,
  note: string,
  machineId: number | null,
): Promise<ActionResult> {
  try {
    await postTransition(orderId, {
      to_status: toStatus,
      note: note || "",
      machine: machineId,
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/machines");
  return { ok: true };
}

export async function requoteOrder(orderId: number): Promise<ActionResult> {
  try {
    await postRequote(orderId);
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createOrder(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const material = String(formData.get("material") ?? "");
  const quantity = Number(formData.get("quantity"));
  const length = String(formData.get("length_mm") ?? "");
  const width = String(formData.get("width_mm") ?? "");
  const height = String(formData.get("height_mm") ?? "");
  const customerRaw = String(formData.get("customer") ?? "");

  if (!name) return { ok: false, error: "Give the part a name." };
  if (!Number.isFinite(quantity) || quantity < 1) {
    return { ok: false, error: "Quantity must be at least 1." };
  }
  for (const [label, value] of [
    ["Length", length],
    ["Width", width],
    ["Height", height],
  ] as const) {
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
      return { ok: false, error: `${label} must be greater than 0 mm.` };
    }
  }

  try {
    const part = await postPart({
      name,
      material,
      quantity,
      length_mm: length,
      width_mm: width,
      height_mm: height,
    });
    await postOrder({
      part: part.id,
      customer: customerRaw ? Number(customerRaw) : null,
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/orders");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function getQuote(
  _prev: QuoteResult | null,
  formData: FormData,
): Promise<QuoteResult> {
  const input = {
    material: String(formData.get("material") ?? "resin_standard"),
    quantity: Number(formData.get("quantity") ?? 1),
    length_mm: Number(formData.get("length_mm") ?? 0),
    width_mm: Number(formData.get("width_mm") ?? 0),
    height_mm: Number(formData.get("height_mm") ?? 0),
  };

  try {
    const quote = await requestQuote(input);
    return { ok: true, quote };
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      return {
        ok: false,
        error:
          "The quoting service is not reachable. In the real flow an order would be saved as quote_pending rather than failing.",
      };
    }
    if (error instanceof ApiError) {
      return { ok: false, error: error.detail };
    }
    return { ok: false, error: "Could not get a quote." };
  }
}

export async function orderFromCatalogue(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const partId = Number(formData.get("part"));
  if (!Number.isFinite(partId) || partId <= 0) {
    return { ok: false, error: "Choose a part to order." };
  }

  try {
    await postOrder({ part: partId });
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/orders");
  revalidatePath("/dashboard");
  return { ok: true };
}
