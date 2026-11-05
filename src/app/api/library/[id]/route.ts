import { requireUser, route } from "@/lib/http";
import { deletePaper, getPaperData } from "@/lib/library";

type Ctx = { params: Promise<{ id: string }> };

/** Serves the stored PDF to its owner (inline, so the browser viewer opens). */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { data, filename } = await getPaperData(user.id, (await params).id);
  return new Response(
    new Blob([data as unknown as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
    {
      headers: {
        "content-disposition": `inline; filename="${filename.replace(/["\\]/g, "")}"`,
        "cache-control": "private, no-store",
      },
    },
  );
});

export const DELETE = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  await deletePaper(user.id, (await params).id);
  return new Response(null, { status: 204 });
});
