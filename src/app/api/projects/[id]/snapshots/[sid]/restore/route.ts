import { NextResponse } from "next/server";
import { enforceRateLimit, fail, HttpError, requireUser, route } from "@/lib/http";
import {
  createFile,
  createSnapshot,
  getEditableProject,
  getFile,
  getSnapshotFiles,
  listFiles,
  saveFile,
} from "@/lib/projects";

type Ctx = { params: Promise<{ id: string; sid: string }> };

/**
 * Restores a snapshot's text files. Files that did not exist when the snapshot
 * was taken are kept (nothing is deleted); binaries are never touched. The
 * pre-restore state is itself snapshotted, so a restore is always undoable.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id, sid } = await params;
  const project = await getEditableProject(user.id, id);
  enforceRateLimit(`snapshots:${user.id}`, 20, 60_000);
  const snap = await getSnapshotFiles(project.id, sid);
  const undo = await createSnapshot(project.id, "antes de restaurar");
  const current = await listFiles(project.id);

  let restored = 0;
  for (const [path, content] of Object.entries(snap)) {
    const file = current.find((f) => f.path === path);
    try {
      if (file) {
        if (file.content === content) continue; // unchanged; don't bump the version
        const latest = await getFile(project.id, file.id);
        await saveFile(project.id, file.id, content, latest.version);
      } else {
        await createFile(project.id, { path, content });
      }
      restored++;
    } catch (err) {
      if (err instanceof HttpError && err.status === 409)
        throw fail(409, "api.snapshots.restoreConflict");
      throw err;
    }
  }
  return NextResponse.json({ restored, undo: undo.id });
});
