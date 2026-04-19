import "server-only";

import { getAuthenticatedUserFromCookies } from "@/server/auth";

export async function getCurrentUser() {
  return getAuthenticatedUserFromCookies();
}

export async function getCurrentUserId() {
  const user = await getAuthenticatedUserFromCookies();
  return user?.id ?? null;
}
