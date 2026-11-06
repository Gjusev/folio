import type { Metadata } from "next";
import { connection } from "next/server";
import { ForgotForm } from "@/components/PasswordReset";
import { getDict } from "@/lib/i18n/server";
import { mailEnabled } from "@/lib/mail";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getDict();
  return { title: dict["auth.forgot.t"] };
}

export default async function ForgotPage() {
  await connection(); // mail on/off is runtime env, never decided at build time
  return <ForgotForm mailOn={mailEnabled()} />;
}
