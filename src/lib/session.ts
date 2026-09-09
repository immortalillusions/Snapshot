/** Signed cookie helpers for the current Snapshot user session. */

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(
	process.env.SESSION_SECRET ?? "development-only-change-me",
);

/** Creates the signed browser session for a user. */
export async function setSession(userId: string) {
	const token = await new SignJWT({ userId })
		.setProtectedHeader({ alg: "HS256" })
		.setExpirationTime("30d")
		.sign(secret);
	(await cookies()).set("snapshot_session", token, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		path: "/",
	});
}

/** Returns the verified session user ID, or null for a missing or invalid token. */
export async function currentUserId() {
	const value = (await cookies()).get("snapshot_session")?.value;
	if (!value) return null;
	try {
		return (await jwtVerify(value, secret)).payload.userId as string;
	} catch {
		return null;
	}
}