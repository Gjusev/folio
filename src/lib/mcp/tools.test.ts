import { describe, expect, it } from "vitest";
import { findTool, toolDescriptors } from "@/lib/mcp/tools";
import { TOKEN_SCOPES } from "@/lib/api-tokens";

const NAMES = [
  "list_projects",
  "get_project",
  "read_file",
  "write_file",
  "compile",
  "search_literature",
  "add_reference",
  "create_snapshot",
  "list_snapshots",
];

describe("tool registry", () => {
  it("exposes exactly the v1 tools", () => {
    const { tools } = toolDescriptors();
    expect(tools.map((t) => t.name)).toEqual(NAMES);
    for (const t of tools) {
      expect(t.description).toMatch(/^[A-Z].*\.$/); // one sentence, English
      expect(t.description).not.toMatch(/\n/);
      expect(t.inputSchema).toMatchObject({ type: "object" });
    }
  });

  it("declares valid scopes; add_reference needs literature AND write", () => {
    for (const name of NAMES) {
      const tool = findTool(name);
      if (!tool) throw new Error(`missing tool ${name}`);
      expect(tool.scopes.length).toBeGreaterThan(0);
      for (const s of tool.scopes) expect(TOKEN_SCOPES).toContain(s);
    }
    expect(findTool("add_reference")?.scopes).toEqual(["literature", "write"]);
  });

  it("validates input schemas the way tools/call will", () => {
    const write = findTool("write_file")!.input;
    expect(() => write.parse({ projectId: "nope", path: "a.tex" })).toThrow();
    const parsed = write.parse({
      projectId: "0d7ce912-8a3c-4a4b-9d90-1c1a2b3c4d5e",
      path: "a.tex",
      content: "x",
    }) as Record<string, unknown>;
    expect(parsed.baseVersion).toBeUndefined();
    expect(() =>
      findTool("add_reference")!.input.parse({
        projectId: "0d7ce912-8a3c-4a4b-9d90-1c1a2b3c4d5e",
        source: "wos",
        paperId: "1",
      }),
    ).toThrow();
    expect(findTool("search_literature")!.input.parse({ query: "attention" })).toMatchObject({
      limit: 8,
    });
  });
});
