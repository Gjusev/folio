import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LibraryPage } from "@/components/LibraryPage";
import { LogoutButton } from "@/components/LogoutButton";
import { Wordmark } from "@/components/Wordmark";
import { requirePageUser } from "@/lib/auth/current";
import { getDict } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getDict();
  return { title: dict["lb.title"] };
}

export default async function LibraryPaperPage() {
  const user = await requirePageUser();
  const { dict } = await getDict();
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Wordmark />
          <Link
            href="/projects"
            className="flex items-center gap-1 text-sm text-muted hover:text-ink"
          >
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
            {dict["projects.title"]}
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted">
          <LangSwitcherWrapper />
          <span className="hidden sm:inline">{user.name}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="sheet mx-2 mb-2 flex-1 sm:mr-2 sm:ml-2">
        <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
          <LibraryPage />
        </div>
      </main>
    </div>
  );
}

// Small indirection so the client component only loads on this page.
import { LangSwitcher } from "@/lib/i18n/client";
const LangSwitcherWrapper = () => <LangSwitcher />;
