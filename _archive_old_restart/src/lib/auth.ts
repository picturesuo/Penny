import "server-only";

import { DEMO_USER_ID } from "@/lib/penny";
import { getAuthenticatedUserFromCookies, getCurrentAuthenticatedUserId } from "@/server/auth";

export async function getCurrentUser() {
  return getAuthenticatedUserFromCookies();
}

export async function getCurrentUserId() {
  const userId = await getCurrentAuthenticatedUserId();
  return userId || DEMO_USER_ID;
}
