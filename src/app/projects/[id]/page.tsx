import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace/Workspace";
import { requirePageUser } from "@/lib/auth/current";
import { HttpError } from "@/lib/http";
import { anyEndpoint } from "@/lib/llm-profiles";
import { getOwnedProject, listFiles } from "@/lib/projects";

export const metadata: Metadata = { title: "Editor" };

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const user = await requirePageUser();
  const { id } = await params;
  const project = await getOwnedProject(user.id, id).catch((err) => {
    if (err instanceof HttpError && err.status === 404) notFound();
    throw err;
  });
  const files = await listFiles(project.id);
  return (
    <Workspace
      project={{
        id: project.id,
        name: project.name,
        mainFile: project.mainFile,
        aiInstructions: project.aiInstructions,
        aiStyleSample: project.aiStyleSample,
        aiPlan: project.aiPlan,
      }}
      initialFiles={files.map((f) => ({
        id: f.id,
        path: f.path,
        content: f.content,
        version: f.version,
        binary: f.binary,
        size: f.size,
      }))}
      aiEnabled={await anyEndpoint(user.id)}
    />
  );
}
