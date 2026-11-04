import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/lib/auth/current";
import { env } from "@/lib/env";
import { getDict } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getDict();
  return { title: dict["auth.create"] };
}

export default async function RegisterPage() {
  if (await currentUser()) redirect("/projects");
  return <AuthForm mode="register" registrationOpen={env().ALLOW_REGISTRATION} />;
}
