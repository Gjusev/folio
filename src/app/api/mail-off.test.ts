import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as forgot } from "@/app/api/auth/forgot/route";
import { POST as createProject } from "@/app/api/projects/route";
import { POST as addMember } from "@/app/api/projects/[id]/members/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../test/helpers";

// Its own file: env() is cached per module graph, so "off" needs a fresh one.
vi.hoisted(() => {
  process.env.SMTP_URL = "";
  process.env.SMTP_HOST = "";
});

// Any transport creation would mean a network attempt.
const createTransport = vi.hoisted(() => vi.fn());
vi.mock("nodemailer", () => ({ createTransport }));

afterAll(async () => {
  await closeDb();
});

beforeEach(() => {
  resetRateLimits();
  createTransport.mockClear();
});

describe("without SMTP", () => {
  it("forgot answers 404 resetOff and touches no network", async () => {
    const { email } = await signUp();
    const res = await forgot(
      request("POST", "/api/auth/forgot", {
        body: { email },
        headers: { cookie: "folio_lang=en" },
      }),
      undefined,
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe(
      "Password reset by e-mail is not enabled on this instance",
    );
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("sharing still works, with emailed:false and no mail", async () => {
    const owner = await signUp();
    const guest = await signUp();
    const created = await createProject(
      request("POST", "/api/projects", { cookie: owner.cookie, body: { name: "Quiet" } }),
      undefined,
    );
    const { project } = await created.json();
    const res = await addMember(
      request("POST", `/api/projects/${project.id}/members`, {
        cookie: owner.cookie,
        body: { email: guest.email, role: "viewer" },
      }),
      ctx({ id: project.id }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.emailed).toBe(false);
    expect(body.member.email).toBe(guest.email);
    expect(createTransport).not.toHaveBeenCalled();
  });
});
