import type { Metadata } from "next";
import { ApiTokensSettings } from "@/components/ApiTokensSettings";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { LlmSettings } from "@/components/LlmSettings";
import { LogoutButton } from "@/components/LogoutButton";
import { Wordmark } from "@/components/Wordmark";
import { ZoteroSettings } from "@/components/ZoteroSettings";
import { requirePageUser } from "@/lib/auth/current";
import { getDict } from "@/lib/i18n/server";
import { getRoutes, listProfiles } from "@/lib/llm-profiles";
import { sealConfigured } from "@/lib/sealed";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getDict();
  return { title: dict["settings.title"] };
}

export default async function SettingsPage() {
  const user = await requirePageUser();
  const { dict } = await getDict();
  const [profiles, routes] = await Promise.all([listProfiles(user.id), getRoutes(user.id)]);
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between px-4 sm:px-6">
        <Wordmark />
        <div className="flex items-center gap-3 text-sm text-muted">
          <LangSwitcherWrapper />
          <span className="hidden sm:inline">{user.name}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="sheet mx-2 mb-2 flex-1 sm:mr-2 sm:ml-2">
        <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6">
          <h1 className="mb-6 text-xl font-semibold">{dict["settings.title"]}</h1>
          <div className="space-y-8">
            <LlmSettings
              initialProfiles={JSON.parse(JSON.stringify(profiles))}
              initialRoutes={routes}
              sealConfigured={sealConfigured()}
            />
            <ZoteroSettings sealConfigured={sealConfigured()} />
            <ApiTokensSettings />
            <AppearanceSettings />
          </div>
        </div>
      </main>
    </div>
  );
}

// Small indirection so the client component only loads on this page.
import { LangSwitcher } from "@/lib/i18n/client";
const LangSwitcherWrapper = () => <LangSwitcher />;
