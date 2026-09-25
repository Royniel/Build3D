import { redirect } from "next/navigation";

import { ApiError, getMe } from "./api";
import type { Me } from "./types";

export async function requireMe(): Promise<Me> {
  try {
    return await getMe();
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      redirect("/login");
    }
    throw error;
  }
}
