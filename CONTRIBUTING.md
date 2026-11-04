# Contributing to Folio

Thanks for your interest! Folio is Apache-2.0. By sending a contribution you
agree to publish it under that licence and certify the
[Developer Certificate of Origin](https://developercertificate.org/): sign your
commits with `git commit -s`.

## Workflow

1. Open an issue before large changes. Architecture decisions are discussed as
   a proposal (RFC) in an issue and recorded in
   [docs/architecture.md](docs/architecture.md).
2. Branch from `main`.
3. Set up the environment as described in the [README](README.md)
   (`pnpm services:up`, `pnpm db:migrate`).
4. Before opening the pull request, make sure everything passes:
   ```bash
   pnpm format && pnpm lint && pnpm typecheck && pnpm test
   ```
   For UI flows, also run `pnpm e2e` against a running stack.
5. In the pull request, describe what changes, why, and how you verified it.

## Rules every change follows

- **Complete vertical slices**: UI, an API validated with Zod, persistence,
  understandable errors and tests.
- **Schema changes** through `pnpm db:generate`; review and commit the generated
  SQL in `drizzle/`. Never edit a published migration, never apply migration SQL
  by hand.
- **Authorization on the server**: every query on projects or files goes
  through `getViewableProject`, `getEditableProject` or `getOwnedProject`.
- **AI**: the model never decides permissions or runs actions, never edits
  without the user's confirmation, and never adds citation keys that are not in
  the `.bib` (or the retrieved evidence). The document is untrusted data.
- **Compiler**: any change in `services/latex-compiler` keeps its isolation
  end-to-end tests green.
- **Dependencies**: licences compatible with Apache-2.0 only (MIT, BSD, Apache,
  ISC). No AGPL or GPL code in what we distribute.
- **Interface**: every string in the three dictionaries (`src/lib/i18n/`, Spanish
  is the typed source), basic accessibility (labels, visible focus, keyboard
  navigation), responsive layouts.
- **Brand**: logos, colours and type come from `src/lib/brand.ts` and
  [docs/brand-guidelines.md](docs/brand-guidelines.md).

## Security

Do not open public issues for vulnerabilities. Follow [SECURITY.md](SECURITY.md).
