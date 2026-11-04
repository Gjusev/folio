import type { Metadata } from "next";
import { LogoutButton } from "@/components/LogoutButton";
import { ProjectList } from "@/components/ProjectList";
import { Wordmark } from "@/components/Wordmark";
import { requirePageUser } from "@/lib/auth/current";
import { getDict } from "@/lib/i18n/server";
import { listProjects } from "@/lib/projects";
import { TEMPLATES } from "@/lib/templates";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getDict();
  return { title: dict["projects.title"] };
}

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const welcome = (await searchParams).welcome === "1";
  const user = await requirePageUser();
  const { dict } = await getDict();
  const projects = await listProjects(user.id);
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between px-4 sm:px-6">
        <Wordmark />
        <div className="flex items-center gap-3 text-sm text-muted">
          <LangSwitcherWrapper />
          <a href="/settings" className="hover:text-ink">
            {dict["settings.title"]}
          </a>
          <span className="hidden sm:inline">{user.name}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="sheet mx-2 mb-2 flex-1 sm:mr-2 sm:ml-2">
        <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
          <ProjectList
            initial={projects.map((p) => ({
              id: p.id,
              name: p.name,
              files: p.files,
              updatedAt: p.updatedAt.toISOString(),
            }))}
            templateIds={TEMPLATES.map((t) => t.id)}
            userName={user.name.split(" ")[0]}
            welcome={welcome}
          />
        </div>
      </main>
    </div>
  );
}

// Small indirection so the client component only loads on this page.
import { LangSwitcher } from "@/lib/i18n/client";
const LangSwitcherWrapper = () => <LangSwitcher />;
