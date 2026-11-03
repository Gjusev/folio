import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getSessionUser, type SessionUser } from "@/lib/auth/session";

export async function currentUser(): Promise<SessionUser | null> {
  return getSessionUser((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requirePageUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
