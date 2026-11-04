import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/Landing";
import { currentUser } from "@/lib/auth/current";
import { env } from "@/lib/env";
import { getDict } from "@/lib/i18n/server";
import { daysUntilPrismCloses } from "@/lib/prism";

export default async function Home() {
  if (await currentUser()) redirect("/projects");
  const { dict } = await getDict();
  return (
    <Landing
      dict={dict}
      daysLeft={daysUntilPrismCloses()}
      registrationOpen={env().ALLOW_REGISTRATION}
    />
  );
}
