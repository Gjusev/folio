import { z } from "zod";
import { enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { requestLang } from "@/lib/i18n/request";
import { appUrl, mailEnabled, sendMail } from "@/lib/mail";
import { inviteEmail } from "@/lib/mail-templates";
import { addMember, getOwnedProject, listMembers } from "@/lib/projects";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Introduce un correo válido")),
  role: z.enum(["editor", "viewer"]).default("viewer"),
});

/** Who the project is shared with. Owner sees this in the share menu. */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getOwnedProject(user.id, (await params).id);
  const members = await listMembers(project.id);
  const owner = await db()
    .select({ userId: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, project.ownerId))
    .limit(1);
  return Response.json({
    owner: owner[0] ?? null,
    members, // owner is not a row here
  });
});

/** Invite (or re-role) a co-author by email. Owner only. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getOwnedProject(user.id, (await params).id);
  enforceRateLimit(`share:${user.id}`, 20, 60_000);
  const { email, role } = await parseJson(req, body);
  const { created, ...member } = await addMember(project.id, email, role);
  // New members only (not role changes); best effort, never blocks or fails the share.
  const emailed = created && mailEnabled();
  if (emailed) {
    const mail = inviteEmail(requestLang(req), {
      inviterName: user.name,
      projectName: project.name,
      role,
      link: `${appUrl()}/projects/${project.id}`,
    });
    void sendMail({ to: member.email, ...mail }).catch(() => {});
  }
  return Response.json({ member, emailed }, { status: 201 });
});
