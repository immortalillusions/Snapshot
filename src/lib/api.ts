/** Shared request helpers for authenticated API route handlers. */

import { NextResponse } from "next/server";
import { currentUserId } from "./session";

type AuthenticatedHandler<Arguments extends unknown[]> = (
  userId: string,
  ...args: Arguments
) => Response | Promise<Response>;

/** Runs a route handler with the current user or returns a standard 401 response. */
export function withAuthenticatedUser<Arguments extends unknown[]>(
  handler: AuthenticatedHandler<Arguments>,
) {
  return async (...args: Arguments): Promise<Response> => {
    const userId = await currentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(userId, ...args);
  };
}