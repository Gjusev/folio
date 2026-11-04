# Release v0.1.0 — checklist del mantenedor

Estado de partida (2026-11-04): repo sin remoto, sin tags, `package.json` en
`0.1.0`, CHANGELOG.md escrito, CI verificado (job `app` usa la imagen
`pgvector/pgvector:pg17` porque la migración `0006` crea la extensión `vector`;
job `compiler` construye el contenedor real y corre sus e2e).

## 0. Prerequisitos (antes de tocar el remoto)

- [ ] Batería local en verde:
      `pnpm services:up` (Postgres pgvector + compilador), luego
      `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- [ ] Versión correcta:
      `node -e "console.log(require('./package.json').version)"` → `0.1.0`.
- [ ] **Secretos en el historial** (el repo se va a hacer público): - Confirmar que `.env` nunca se commiteó:
      `git log --all --full-history -- .env` (debe salir vacío) y
      `git ls-files | grep '^\.env'` (solo `.env.example`). - Barrido de tokens en las 55 revisiones:
      `git grep -iE "(api[_-]?key|token|password|secret)[\"']?[:=][\"']?[A-Za-z0-9/_+-]{16,}" $(git rev-list --all)`
      (o `gitleaks detect --no-git --redact` / `trufflehog git file://.`).
      Nota: `ci.yml` define a propósito `COMPILER_TOKEN: ci-compiler-token-…`,
      un valor de prueba público, no un secreto. - Si aparece algo: rotar la credencial ANTES del push. El historial ya no
      se puede arreglar sin rewrite; con el repo aún privado, la ventana es
      esta.
- [ ] Revisar `CHANGELOG.md` (sección 0.1.0) — es el texto de la Release.

## 1. Repo público

- [ ] Crear el repositorio en GitHub (p. ej. `owner/folio`), Apache-2.0 ya en
      LICENSE/NOTICE.
- [ ] `git remote add origin git@github.com:owner/folio.git && git push -u origin master`
      (si se prefiere `main` como rama por defecto: renombrar con
      `git branch -m master main` ANTES del push; `ci.yml` ya dispara en ambas).
- [ ] Verificar que el primer push pone CI en verde (ambos jobs: `app` y
      `compiler`).
- [ ] Añadir al final de `CHANGELOG.md` el enlace de comparación:
      `[0.1.0]: https://github.com/owner/folio/releases/tag/v0.1.0`
- [ ] Tag firmado:
      `git tag -s v0.1.0 -m "Folio 0.1.0" && git push origin v0.1.0`
      (requiere clave de firma configurada: `git config --global user.signingkey`).
- [ ] GitHub Release «v0.1.0» con el contenido de la sección 0.1.0 del
      CHANGELOG y 3–4 capturas (dashboard, editor+PDF, grafo, salud de citas).

## 2. Imagen Docker

- [ ] Build multi-arch y push del Dockerfile raíz (web):
      `docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/owner/folio:0.1.0 -t ghcr.io/owner/folio:latest --push .`
      Añadir el secreto de build si el Dockerfile lo usa (ver `Dockerfile`).
      La etiqueta local del stack es `folio:0.1.0` (`docker-compose.yml`,
      servicio `web`).
- [ ] Smoke test de la imagen publicada en un directorio limpio:
      `curl -fsSL https://ghcr.io/…` no basta — desplegar con un compose
      mínimo y compilar un documento real.
- [ ] Nota honesta: el build de la web en Docker se interrumpió en esta
      máquina por memoria (verificado con `pnpm build` nativo; see
      IMPLEMENTATION_PLAN.md iteración 1). Probar el multi-arch ANTES del
      anuncio y, si falla, publicar solo compose desde fuente.

## 3. Anuncio

- [ ] r/LaTeX (leer las reglas de autopromoción antes) y Show HN
      («Show HN: Folio – self-hosted LaTeX editor…»). Opcional: r/selfhosted.
- [ ] El texto incluye QUÉ es, POR QUÉ existe (Prism cierra el 2027-01-01),
      licencia, cómo probarlo en 3 comandos (git clone + `docker compose
--profile app up -d --build` + `.env`) y la sección «qué NO está» de
      abajo, tal cual. La honestidad sobre límites es un principio del
      proyecto, no un gesto.

## Qué NO está en 0.1.0 (copiar tal cual al anuncio)

- Colaboración CRDT en tiempo real: **opt-in y experimental** (`COLLAB_URL`
  vacío por defecto = apagada); el relay corre en la red interna y en
  producción exige un proxy same-origin `wss://`.
- RAG necesita un proveedor de embeddings (variables `LLM_*`); sin él, el
  indexado responde 503 con un mensaje claro. No probado con embeddings de
  pago: la verificación usó un servidor de embeddings falso determinista.
- Sin multi-instancia: el rate-limit vive en memoria (una instancia web); el
  compilador es un contenedor compartido con `MAX_CONCURRENT_JOBS`.
- Sin SSO/OIDC: solo cuentas locales.
- Coseno de RAG en JS sin índice ANN (suficiente a esta escala).
- IA verificada contra servidores OpenAI-compatible falsos en tests; no hay
  verificación con modelos de pago en CI.

## 4. Post-release

- [ ] Abrir issues del roadmap posterior (IMPLEMENTATION_PLAN.md §6): planificador
      con crítica por secciones, cascada DataCite arXiv→publicado, grafo
      multisequilla v2, binarios/figuras adicionales.
- [ ] Anotar aquí las URLs del anuncio y de la Release para el histórico.
