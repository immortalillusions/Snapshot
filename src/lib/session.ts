import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "development-only-change-me");
export async function setSession(userId: string) { (await cookies()).set("snapshot_session", await new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("30d").sign(secret), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" }); }
export async function currentUserId() { const value = (await cookies()).get("snapshot_session")?.value; if (!value) return null; try { return (await jwtVerify(value, secret)).payload.userId as string; } catch { return null; } }