# Folio as an MCP server (bring your own agent)

Folio speaks the Model Context Protocol over Streamable HTTP, so **your own
agent — Claude Code, Codex, Cursor, a script — can work on your projects**
with exactly the permissions you give it. This is the open answer to "OpenAI
sends Prism users to Codex, which does not reproduce Prism's shared real-time
editor": with Folio, the agent edits the sources and you keep the shared
editor, the sandboxed compiler and the versions.

## Enabling it

1. Folio → **Settings → Agent access**: create a personal access token
   ("agent key"). It is shown **once**; only its hash is stored.
2. Give the token the scopes it needs (below).
3. Point your tool at Folio's endpoint:

```bash
# Claude Code
claude mcp add --transport http folio https://your-folio.example/api/mcp \
  --header "Authorization: Bearer folio_YOUR_TOKEN"

# Any MCP client: POST JSON-RPC 2.0 to /api/mcp with the same header.
```

The server is stateless (no sessions); every call carries the token.

## Scopes

| Scope       | Allows                                                       |
| ----------- | ------------------------------------------------------------ |
| `read`      | List projects and files, read file contents and snapshots    |
| `write`     | Create and overwrite files, add references, create snapshots |
| `compile`   | Run the sandboxed compiler and read its log                  |
| `literature`| Search the literature and fetch papers                       |

- `add_reference` needs **literature + write** (it searches, then edits a `.bib`).
- The token acts **as you**: project access follows your role. A viewer's
  token can read a shared project but not write it — enforced server-side,
  not by convention.
- Tokens never manage tokens: creating or revoking them is a browser-session
  action only.

## Tools (v1)

| Tool               | Scope            | What it does                                                            |
| ------------------ | ---------------- | ----------------------------------------------------------------------- |
| `list_projects`    | read             | Your projects with your role in each                                    |
| `get_project`      | read             | Files (path, size, version) and the main file of one project            |
| `read_file`        | read             | A text file's content and version (binary files are refused)            |
| `write_file`       | write            | Upsert a file. Existing files need the `baseVersion` you got from `read_file`; on conflict the current version is returned |
| `compile`          | compile          | Compile in the sandbox; returns ok/seconds/errors(file,line,message) — never PDF bytes |
| `search_literature`| literature       | OpenAlex search: title, authors, year, DOI, citations, paper id         |
| `add_reference`    | literature+write | Add a retrieved paper to the project's first `.bib`; returns the cite key |
| `create_snapshot`  | write            | Checkpoint the whole project (do this before sweeping edits)            |
| `list_snapshots`   | read             | Existing checkpoints                                                    |

Results are JSON, stringified as MCP text content. Errors come back as
`isError: true` with a message an agent can act on ("read the file first",
"this token lacks the write scope").

## The permission model, honestly

- **The token is you.** Anything the scopes allow, the agent does in your
  name; every write is a normal edit with optimistic concurrency (a stale
  `baseVersion` is refused, so two writers cannot silently clobber each
  other).
- **Folio's "the AI never edits without confirmation" rule applies to Folio's
  own assistant**, which proposes diffs you apply. An agent you drive with
  your key is you editing — same as using `curl`. Take a snapshot first and
  diff it afterwards if you want the same safety net.
- **Rate limits and the project AI policy still apply.** Agent calls count
  against your limits; a project whose owner turned AI off is untouched by
  this (MCP tools are not AI — they are your hands).
- **No PDF bytes over MCP**, no token listing, no member management: the
  surface is intentionally small. Ask for more tools by opening an issue.

## Testing it yourself

```bash
T=folio_...  # your token
curl -s https://your-folio.example/api/mcp \
  -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```
