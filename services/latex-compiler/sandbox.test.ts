// Unit tests for the per-job sandbox's pure parts: the exact bwrap argv
// and the boot log line. The probe itself needs a real bwrap plus user
// namespaces, so its outcome is exercised by the e2e suite (which runs
// the real container) rather than mocked here.
import { describe, expect, it } from "vitest";
import { bwrapArgs, probeLogLine } from "./server";

describe("bwrapArgs", () => {
  const argv = bwrapArgs("/tmp/job-ab12", "latexmk", ["-pdf", "main.tex"]);

  it("returns the exact argv in the contract order", () => {
    expect(argv).toEqual([
      "--unshare-all",
      "--die-with-parent",
      "--new-session",
      "--ro-bind",
      "/",
      "/",
      "--dev",
      "/dev",
      "--proc",
      "/proc",
      "--tmpfs",
      "/tmp",
      "--bind",
      "/tmp/job-ab12",
      "/tmp/job-ab12",
      "--chdir",
      "/tmp/job-ab12",
      "--",
      "latexmk",
      "-pdf",
      "main.tex",
    ]);
  });

  it("unshares everything (network and IPC included) and dies with the parent", () => {
    expect(argv.slice(0, 3)).toEqual(["--unshare-all", "--die-with-parent", "--new-session"]);
  });

  it("binds the job dir AFTER the /tmp tmpfs, so the mount wins over it", () => {
    const bind = argv.indexOf("--bind");
    expect(bind).toBeGreaterThan(argv.indexOf("--tmpfs"));
    // Source resolves in the real mount namespace, destination overlays the tmpfs.
    expect(argv[bind + 1]).toBe("/tmp/job-ab12");
    expect(argv[bind + 2]).toBe("/tmp/job-ab12");
  });

  it("makes / read-only before anything else mounts over it", () => {
    const roBind = argv.indexOf("--ro-bind");
    expect(argv[roBind + 1]).toBe("/");
    expect(argv[roBind + 2]).toBe("/");
    expect(roBind).toBeLessThan(argv.indexOf("--tmpfs"));
  });

  it("separates the command from bwrap flags with -- and passes args through", () => {
    const sep = argv.indexOf("--");
    expect(sep).toBe(argv.length - 4); // --, latexmk, -pdf, main.tex
    expect(argv[sep + 1]).toBe("latexmk");
    expect(argv.slice(sep + 2)).toEqual(["-pdf", "main.tex"]);
    expect(bwrapArgs("/j", "synctex", ["view", "-o", "x.pdf"]).slice(-5)).toEqual([
      "--",
      "synctex",
      "view",
      "-o",
      "x.pdf",
    ]);
  });
});

describe("probeLogLine", () => {
  it("reports the bwrap mode with kernel and userns counter", () => {
    expect(probeLogLine("bwrap", "", "6.1.0-37-amd64", "63807")).toBe(
      "isolation=bwrap kernel=6.1.0-37-amd64 userns=63807",
    );
  });

  it("reports the failure reason head, also when userns is unknown", () => {
    expect(
      probeLogLine(
        "none",
        "bwrap exit 1: bwrap: No permissions to create new namespace",
        "6.1.0",
        "?",
      ),
    ).toBe(
      "isolation=none reason=bwrap exit 1: bwrap: No permissions to create new namespace " +
        "kernel=6.1.0 userns=?",
    );
  });
});
