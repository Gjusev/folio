# Auditoría de producto — Folio (2026-11-03)

*Todo lo afirmado sobre Folio proviene del código y documentación del repo (verificado por tres exploraciones independientes: frontend, backend/API, compilador/CI/Docker, más `reviews/graph-review.md`). Lo que viene de mi conocimiento general está marcado «no verificado»; los datos de mercado vienen de búsqueda web con fuentes enlazadas.*

## Resumen ejecutivo

Folio cubre con nivel sobresaliente el trabajo de **buscar y citar** (3 motores deduplicados por DOI, grafo estilo Connected Papers desde búsqueda o desde el `.bib`, salud de citas, upgrade arXiv→publicado, contrato de citas `enforceCiteKeys`) y **compilar/iterar** (contenedor aislado sin timeout de plan gratuito, PDF↔código, latexdiff contra snapshots). **Redactar** es sólido (steering persistido, plan por secciones, inserción con confirmación) pero le faltan superficies básicas: conteo de palabras, linting, autocompletado de comandos. **Versionar** está razonable (snapshots + latexdiff + deshacer). Dos huecos graves: **colaborar es inexistente** (un solo dueño por proyecto, sin compartir ni comentarios) y **preparar el envío es flojo** (sin checklist de venue, sin conteo de palabras/páginas, sin espacio de réplicas). Para el día del cierre de Prism (2027-01-01) el activo decisivo ya existe —el importador ZIP que acepta fuentes LaTeX— pero no está etiquetado ni testado como ruta de migración Prism, y competidores comerciales ya publicitan esa migración. La IA sigue sin probarse nunca contra un modelo real de pago; nada está commiteado a git.

## 1. Auditoría JTBD

| Fase | Estado | Qué cubre hoy (evidencia) | Hueco principal |
|---|---|---|---|
| Plantear / estructurar | **Medio** | 7 plantillas testadas e2e (14/14 en contenedor real); agente `action=plan` genera esquema 3–10 secciones con citas reales, persistido en `projects.ai_plan` (`agent/route.ts:129`) | El plan **no es editable** en UI (sin reordenar/borrar/editar, `AiPanel.tsx:546`); no hay esqueleto por venue con requisitos (palabras clave, declaraciones) |
| Redactar | **Sólido con huecos** | CodeMirror 6 con autocompletado `\cite`/`\ref` desde `.bib` y `\label` reales; steering persistido (instrucciones + muestra de estilo + longitud, migración 0003); streaming; **nada se inserta sin confirmación** (`canReplace`, guard en `replaceRange`) | Sin conteo de palabras, sin corrector, sin `linter()` (lintKeymap presente pero sin fuente), autocompletado de **comandos LaTeX desactivado** (el override mata las fuentes por defecto, `CodeEditor.tsx:107`); contexto del asistente capado a 24k chars; historial de chat **se pierde al recargar** (`useState` en `AiPanel.tsx:72`) |
| Buscar y citar | **Sobresaliente** — el mejor ciclo del producto | Búsqueda unificada OpenAlex+S2+arXiv (paralelo, dedup por DOI, fallo parcial tolerante), DOI/arXiv-ID directo, 1-clic citar+insertar, recomendaciones con motor etiquetado, grafo de 1 paper y de todo el `.bib` (93 nodos verificados e2e), salud de citas (sin usar/ghost), upgrade arXiv→publicado conservador (similitud ≥0.85 + apellido + año) | Sin **Zotero** (Prism lo tiene); sin búsqueda por campos (`title:`/`author:`); sin cola de lectura ni favoritos; sin editar entradas BibTeX en UI; el abstract nunca entra al `.bib` y no se descarga ningún PDF |
| Revisar / responder revisores | **Flojo** | latexdiff compilado a PDF contra snapshots (e2e 18/18); salud de citas detecta claves muertas; errores `archivo:línea` clicables | Sin **chktex/texcount** (grep: 0 resultados en Dockerfile y src); sin espacio de **réplicas** (response letter); sin diff entre dos snapshots; sin detección de `\todo`; sin comentarios internos |
| Versionar | **Medio** | Snapshots manuales con etiqueta, diff latexdiff, restaurar con auto-deshacer (solo ficheros que difieren); autoguardado con concurrencia optimista (409 + banner «la del servidor / la mía») | Sin historial automático por compilación; sin versiones con nombre; sin git; snapshots sin tests dedicados (0 bloques de test) |
| Colaborar | **Ausente** | — | `projects.owner_id NOT NULL`, todo query scoping por dueño (`projects.ts:113-122`); sin `project_members`, sin compartir, sin roles, sin comentarios, sin presencia. La concurrencia optimista solo protege al mismo usuario en dos pestañas. Es el hueco mayor del producto |
| Preparar envío | **Flojo** | Export PDF + ZIP de fuentes (lo que arXiv pide); plantillas IEEE/Elsevier/REVTeX/AMS/tesis/beamer | Sin checklist de envío (límite de páginas, anonimato — roadmap ítem 8 no construido), sin conteo de palabras/páginas, sin carta al editor, sin DOCX para revistas que exigen Word («no verificado»: muchas revistas de CV/vida lo hacen), sin ORCID/cover letter |
| Post-envío / reutilización | **Flojo** | Export TikZ del grafo real e2e (95 KB compilado); réplicas sin espacio propio; sin DOCX, sin métricas, sin gestión de reuso de material (charlas/poster) |

**Lectura de conjunto:** Folio hoy es un *escritorio individual de escritura-citación* excelente para un autor solo, con una brecha existencial en el trabajo multiautor y en los trámites finales del envío — justo las fases por las que Overleaf y Prism retienen usuarios.

## 2. Brechas competitivas

**vs OpenAI Prism** (nube, gratis, GPT-5.2 integrado; cierre 2027-01-01 con borrado de datos — [anuncio oficial](https://openai.com/index/introducing-prism), [InfoQ](https://www.infoq.com/news/2026/01/openai-prism)):
- *Dónde gana Folio:* datos en tu Postgres (Prism borra todo); IA agnóstica de proveedor con claves cifradas AES-256-GCM; **citas estructuralmente verificadas** (enforceCiteKeys strippea claves inventadas en servidor — responde a la crítica documentada de que la IA de Prism altera citas, volcada en el README); compilación aislada con límites reales (45 s por trabajo, 429 al saturar); grafo Connected-Papers **incluido gratis** (Connected Papers cobra 6 $/mes por grafos ilimitados, [pricing](https://www.connectedpapers.com/pricing)); Apache-2.0 con export ZIP permanente.
- *Dónde pierde:* Prism requiere cero setup; Folio exige Docker+Postgres+imagen TeX (minutos la primera vez) — barrera para la mayoría de científicos. Prism tiene **colaboración en tiempo real** y **sincronización Zotero** ([rota al lanzar, según CriticalX](https://criticalx.substack.com/p/openai-prism-is-here-and-its-zotero)); Folio no tiene ninguna de las dos. El modelo de Prism viene incluido; en Folio el usuario aporta clave de API.
- *El punto de fuga:* Prism exporta ZIP con fuentes+bib+figuras ([guía de migración de terceros](https://inscrive.io/articles/migrate-from-prism)) — exactamente lo que el importador de Folio ya procesa para Overleaf/arXiv (`src/lib/importer.ts`, `POST /api/projects/import`). Es la puerta de entrada natural y **hoy no está testada ni etiquetada como tal**. Competidores comerciales ya publicitan "importa tu ZIP de Prism" ([letx](https://letx.app/vs/prism), inscrive, Scime draft). Folio llega tarde a ese gancho.

**vs Overleaf** (CE y pago; [límites](https://docs.overleaf.com/getting-started/free-and-premium-plans/plan-limits), [premium](https://docs.overleaf.com/getting-started/free-and-premium-plans/premium-features)):
- *Dónde gana Folio:* sin timeout de 10 s del plan gratis de Overleaf (compilador propio, 45 s/trabajo); sin límite de colaboradores por plan; citación unificada mucho más rica (Overleaf no trae búsqueda de literatura ni grafo); latexdiff visual integrado; latexdiff+snapshots gratis (track changes e historial completo de Overleaf son premium, y Git/GitHub sync también).
- *Dónde pierde:* colaboración real-time (Overleaf la tiene gratis con límites; Folio nada); track changes/comentarios; ecosistema: Overleaf es estándar de facto con revistas y coautores encima («no verificado»: conocimiento general); editor más pulido (conteo de palabras, corrector, outline del documento — «no verificado» en el detalle); Overleaf CE existe como alternativa autoalojada aunque con pila pesada de servicios «no verificado» — Folio es un solo servicio web + compilador + Postgres, mucho más ligero de operar.

**vs Connected Papers:** gana Folio donde se cruzan: grafo dentro del flujo de escritura, sembrado desde tu propio `.bib` (25 DOIs, 93 nodos e2e), export TikZ al paper, coste cero. Pierde en UX de exploración (sin tooltip de hover, sin enfoque de cámara, layout no determinista que hace el export TikZ irreproducible — hallazgos verificados 3/4/5/6 de `reviews/graph-review.md`) y en semántica: CP usa **similitud** (co-citación) «no verificado», Folio usa enlaces de cita — diferente y a veces peor para "qué leo primero". Las islas del grafo multisequilla están sin resolver (hallazgo 11).

**vs Zotero + editor LaTeX:** Zotero es el sistema de referencia dominante con Better BibTeX para auto-export «no verificado». Folio no tiene ni importación ni sincronización: un usuario Zotero tiene que reconstruir su bibliografía a mano (subir un `.bib` funciona vía uploads, pero sin dedup asistida ni sync). Prism sincroniza con Zotero. Es la integración que más usuarios bloquea en la puerta.

**Otros del flujo científico** («no verificado», conocimiento general): SciSpace/Paperpal/Jenni AI compiten en redacción-asistida en nube sin LaTeX-first; TexStudio/TeXworks cubren escritorio sin colaboración ni IA; Typst crece en experiencia de escritura pero las revistas no lo aceptan para envío directo ([discusión #3799](https://github.com/typst/typst/discussions/3799); [Underleaf 2026](https://www.underleaf.ai/blog/typst-vs-latex)) — no amenaza el nicho LaTeX-de-envío de Folio a corto plazo, pero fija la barra de fluidez de edición.

**Fuentes web:** [Introducing Prism (OpenAI)](https://openai.com/index/introducing-prism) · [InfoQ](https://www.infoq.com/news/2026/01/openai-prism) · [hilo r/LaTeX del cierre](https://www.reddit.com/r/LaTeX/comments/1xdq8hm/prism_is_shutting_down_on_january_1_2027) · [guía de migración con export ZIP](https://inscrive.io/articles/migrate-from-prism) · [letx vs Prism](https://letx.app/vs/prism) · [Overleaf plan limits](https://docs.overleaf.com/getting-started/free-and-premium-plans/plan-limits) · [Overleaf premium features](https://docs.overleaf.com/getting-started/free-and-premium-plans/premium-features) · [Overleaf Git/GitHub](https://www.overleaf.com/learn/how-to/Git_integration) · [Connected Papers pricing](https://www.connectedpapers.com/pricing) · [Typst journals #3799](https://github.com/typst/typst/discussions/3799) · [Typst vs LaTeX 2026](https://www.underleaf.ai/blog/typst-vs-latex) · [CriticalX sobre Zotero en Prism](https://criticalx.substack.com/p/openai-prism-is-here-and-its-zotero)

## 3. Top 10 mejoras por palanca

### Quick wins (<1 día)

**1. Ruta de migración Prism: testear el importador con ZIP de Prism + etiqueta «Ven de Prism» + importación por lotes.**
*Problema:* el argumento comercial decisivo (Prism muere, tus datos se borran) ya está servido por maquinaria existente que nadie nombra; la competencia sí lo publicita.
*Implementación:* el importador ya detecta `\documentclass` y descarta artefactos (`src/lib/importer.ts`, `POST /api/projects/import`, `ProjectList.tsx:62-86`). (a) Fixture `test/prism-export.zip` (main.tex + bib + figures/, réplica del formato de export de Prism descrito públicamente) con test e2e siguiendo el patrón de `scripts/make-test-zip.mjs`; (b) entrada "Importar desde Prism" en el diálogo de ProjectList que documenta la ruta Settings→Data Controls→Export all; (c) importación en lote: hoy el rate limit de import es **10/10 min por usuario** (`import/route.ts:12`) — un usuario con 30 proyectos de Prism chocaría; subir el bucket o añadir un bucle cliente con reintento.
*Verificación e2e:* Playwright — export-zip simulado → importar → compilar → PDF ok → salud de citas 0 ghosts; batch de 12 zips sin 429.

**2. chktex + texcount en la imagen del compilador (`/lint` y `/count`).**
*Problema:* fases "Revisar" y "Preparar envío" sin sus dos herramientas básicas; el usuario no sabe cuántas palabras tiene ni ve errores de estilo.
*Implementación:* añadir `chktex` y `texlive-extra-utils` (trae texcount) al Dockerfile (`services/latex-compiler/Dockerfile:4-11`); dos endpoints nuevos en `server.ts` copiando el patrón existente de validación/timeout/kill de grupo (modelos: `compile()` y `latexdiff()`); clientes `lintProject()`/`countProject()` en `src/lib/compiler.ts`; en la UI, contador de palabras en la cabecera del PdfPanel y avisos de chktex mezclados en `IssueList` (reusa el render de errores/warnings con salto a línea).
*Verificación e2e:* extender `compile.e2e.test.ts` — `/count` sobre fixture devuelve número plausible; `/lint` señala un error plantado; UI muestra el contador tras compilar.

**3. Persistir las conversaciones de IA.**
*Problema:* todo el historial del asistente y del agente desaparece al recargar (`useState`, `AiPanel.tsx:72`; confirmado sin tabla en el schema) — en uso diario con un agente de redacción, perder el trabajo es imperdonable.
*Implementación:* migración 0005 `ai_messages(id, project_id, role, action, content, created_at)`; persistir al terminar cada stream en `ai/route.ts` y en el `done` del agente (`agent/route.ts`); `GET` de últimos N al montar el panel (el patrón de carga inicial ya existe con `initialPlan` en `Workspace.tsx:318`).
*Verificación e2e:* fake-LLM (patrón de `agent.test.ts`) → recargar página → historial visible; aislamiento por proyecto con el suite existente de projects.test.ts.

**4. Duplicar proyecto + buscar/ordenar la lista.**
*Problema:* fricción diaria — no hay forma de partir de una versión propia como base, ni de encontrar un proyecto en una lista que solo crece (sin filtro, sin orden, sin paginación: `ProjectList.tsx`).
*Implementación:* `duplicateProject()` en `src/lib/projects.ts` (copia fila + files, respeta cuota de 50 MB vía `checkFiles` existente, excluye snapshots); `POST /api/projects/[id]/duplicate` con requireUser + rate limit; input de filtro y orden por `updated_at` en ProjectList (client-side basta al inicio).
*Verificación e2e:* test de integración — duplicado conserva ficheros 1:1 y cuota; extraer el main correcto si era subcarpeta; UI: duplicar → entrar → compilar.

### Medianas (1–2 semanas)

**5. Compartir proyecto con roles (dueño/editor/lector).**
*Problema:* el hueco JTBD más grave (colaborar); el 70 % del valor (director→doctorando, coautor revisa) se captura sin CRDT.
*Implementación:* migración 0006 `project_members(project_id, user_id, role)` + índice; sustituir `getOwnedProject` por `getAccessibleProject` (owner OR member) — **todas** las 38 rutas ya canalizan por ahí (`projects.ts:113-122`), así que el cambio de autorización queda concentrado; lector: GET/compile/export sí, PUT/PATCH/DELETE → 403; editor: todo menos borrar/compartir; UI: botón Compartir en la cabecera del workspace (invitar por email → lookup en `users`, lista de miembros con rol); el 404-a-extraños se conserva para quien no es ni owner ni member (anti-probing ya testeado).
*Verificación e2e:* extender la suite de aislamiento de `projects.test.ts` — miembro lector ve el proyecto pero 403 al escribir; miembro eliminado vuelve a 404; compilar como miembro.

**6. Checklist de envío por venue.**
*Problema:* el trámite final — límites de páginas, anonimato, referencias huérfanas, TODOs olvidados — hoy se hace a ojo fuera de la herramienta.
*Implementación:* metadatos de venue en `src/lib/templates.ts` (pageLimit, blind, requiere keywords/declaraciones); endpoint `GET /api/projects/[id]/submission-check` que agrega lo que ya existe: `citationHealth()` (sin usar/ghost), texcount de la mejora #2 (palabras ≈ páginas), regex de `\todo|XXX|TBD` sobre los .tex, figuras `\includegraphics` declaradas vs presentes (las rutas ya se validan en `paths.ts`), warnings de la última compilación; componente `ChecklistView` en el sidebar junto a "Salud de citas".
*Verificación e2e:* fixture que viola cada regla → checklist roja en cada item; arreglar → verde; plantilla IEEE con límite → aviso de exceso.

**7. SyncTeX real (forward e inverse exactos).**
*Problema:* la función bandera PDF↔código es una heurística de las primeras 6 palabras (`PdfViewer.tsx:88-94`) que falla con fórmulas y texto repetido.
*Implementación:* latexmk ya genera `.synctex.gz`; endpoint `/synctex` en el servicio (el CLI `synctex` viene con TeX Live — «no verificado» el nombre exacto del paquete Debian) resolviendo consultas forward/inverse dentro del job dir con el mismo patrón de seguridad; `synctexQuery()` en `compiler.ts`; el clic del PDF pasa página+x/y → línea exacta; reveal del editor → página destino en el visor (hoy solo detecta página visible).
*Verificación e2e:* compilar fixture, consulta inversa sobre una palabra conocida → file:line exacto; forward desde línea N → página P; luego clic real en navegador.

**8. Espacio de réplicas (response letter).**
*Problema:* la fase de R&R no tiene hogar; el usuario la hace en Word fuera del sistema que tiene sus citas y su diff.
*Implementación:* plantilla `response-letter` en `templates.ts` (estructura punto por punto); `action=rebuttal` en `agent/route.ts` reutilizando evidencia+`enforceCiteKeys` con los comentarios del revisor pegados como entrada estructurada; el diff original↔revisado ya existe vía latexdiff — enlazar sección revisada ↔ punto de la carta. Persistencia en ficheros del proyecto (cero migración).
*Verificación e2e:* fake-LLM — la carta solo cita claves del .bib; inserción solo con confirmación; compilar carta+paper en el mismo proyecto.

**9. Sincronización Zotero.**
*Problema:* el gestor de referencia dominante (con Better BibTeX) está fuera; bloquea la migración de cualquier grupo que ya tenga biblioteca.
*Implementación:* sección Zotero en `/settings` (API key + userID, selladas con `sealed.ts` como los perfiles LLM); endpoint `POST /api/projects/[id]/citations/zotero-sync` que descarga la colección en formato BibTeX (endpoint `format=bibtex` de la API de Zotero — «no verificado» el parámetro exacto) y pasa cada entrada por `addBibEntry` (dedup DOI/título y renombrado de claves ya existen en `bibtex.ts:38-66`); informe de salud post-sync con `citation-health.ts`.
*Verificación e2e:* servidor Zotero simulado en vitest (patrón de los mocks de OpenAlex/S2) — sync añade 5 entradas, reintento no duplica; colisión de clave renombra; opcional verificación en vivo.

**10. (Grande, 1+ mes) Colaboración en tiempo real con Yjs.**
*Problema:* la única función donde Prism y Overleaf ganan por goleada; sin ella, un grupo de investigación no puede adoptar Folio como sistema principal.
*Implementación:* Yjs + `y-codemirror.next` en el editor; relay WebSocket como tercer servicio contenedor cero-dependencias (el patrón ya existe en `latex-compiler`), red `compile`-style interna; autorización heredada de `project_members` (#5); persistencia: el relay hace debounce de updates → `PUT files/[fileId]` con service token (la concurrencia optimista queda para clientes no-Yjs); presencia con cursores.
*Verificación e2e:* dos contextos Playwright editando el mismo párrafo → convergencia sin 409; desconexión/reconexión de uno → sync al volver; lector no ve edición.
*Lectura honesta de palanca:* #5 da la mayor parte del JTBD colaborativo por ~20 % del coste; Yjs solo tiene sentido después, para no gastar el mes en la variante cara de algo que #5 ya resuelve parcialmente.

**Quedan fuera por palanca inferior** (mencionables para después): RAG sobre PDFs con pgvector (el routing `embed` de LLM existe pero es vestigial: nadie lo consume — es el ítem "asesina de Elicit" del jurado, pero es 1+ mes con riesgo de calidad), grafo v2 con islas/comunidades y determinismo (hallazgos 6 y 11 del review del grafo: PRNG sembrado es un arreglo de horas, hazlo junto a #2), DOCX vía pandoc en la imagen, cola de lectura.

## 4. Riesgos de producto y plan de adopción

### Por qué un usuario de Prism NO migraría

1. **Setup vs cero setup.** Prism era abrir una URL. Folio exige Docker Desktop, Postgres, token de compilador y una imagen TeX que se construye minutos la primera vez. El científico medio no administra servidores. Es el riesgo #1 y no se arregla con features.
2. **Colaboración en tiempo real.** Si en Prism compartía el paper con su director y veían cursores, Folio hoy no puede ni mostrarle el proyecto a otro usuario (`owner_id NOT NULL`, sin members). La mejora #5 es la respuesta mínima viable antes de任何 campaña.
3. **IA incluida vs BYOK.** En Prism el modelo venía con el producto; en Folio el usuario consigue una clave de API (las suscripciones de consumidor están legalmente cerradas — verificado en iteración 4). El costo cognitivo de "elegir proveedor" es real; los presets y Ollama lo mitigan pero no lo eliminan.
4. **Zotero.** Su bibliografía vive en Zotero; sin sync (#9) la migración implica rehacer trabajo.
5. **La promesa de IA sin demo real.** Todo el diferenciador (agente con contrato de citas) está verificado contra LLM falso; **nunca se probó con un modelo de pago** (pendiente desde la iteración 1, re-confirmado en la 6). Si la primera experiencia real de un migrante es mediocre, no hay segundo intento.

### Riesgos internos (verificados en el repo)

6. **Nada está commiteado.** Un solo "Initial commit" y todo el trabajo sin versionar en `master` — riesgo de pérdida catastrófica y, peor, imposible publicar repo, docs y comunidad durante la ventana de 14 meses. Es la primera acción del plan, no una opción.
7. **Operación autoalojada mínima.** El compose no trae backups (solo volumen `pgdata`), ni TLS (loopback + "pon un proxy"), ni monitorización; sin reset de contraseña ni email en absoluto (verificado: cero SMTP en src) — el usuario que olvida la contraseña queda fuera permanentemente. Para un laboratorio, backup + reset son mínimos de adopción.
8. **Dependencia de OpenAlex para grafo/búsqueda.** Capa sin clave a 0,10 $/día compartidos por IP, `filter=cites:` que miente con registros duplicados, S2 que da 429 a diario (verificado en iteraciones 4–6). `OPENALEX_API_KEY` ya está soportada; el grafo sigue siendo OpenAlex-only.
9. **Contenedor de compilación compartido entre todos los trabajos** (límite documentado en §4 del plan; `MAX_CONCURRENT_JOBS=2`) y rate limiting en memoria por proceso (marcado como tech-debt en `rate-limit.ts:1-2`): correctos para un solo grupo, insuficientes para una instancia multi-equipos.
10. **Ventana de mercado ya abierta sin Folio en ella:** competidores comerciales publicitan migración desde Prism hoy. Cada mes sin landing, repo público y guía de migración es cuota capturada por otros.

### Plan de adopción hacia 2027-01-01

- **Ahora (semana 0):** commit atómico a git y repo público. Sin esto, nada de lo demás existe para el mundo.
- **Mes 1:** #1 (ruta Prism testada + landing "Migra de Prism en 2 pasos" que hable del borrado de datos), #2 y #3. Publicar guía de migración con el flujo exacto de export de Prism.
- **Mes 2–3:** batería de IA contra modelos reales de pago (contrato de citas, streaming, latencia) + #4 y #5 (compartir). Primer "quickstart ≤5 min" grabado: `docker compose --profile app up` → cuenta → plantilla → compilar → importar ZIP de Prism.
- **Mes 4–6:** #6–#9 (checklist, SyncTeX, réplicas, Zotero); backups en compose (`pg_dump` con cron + página de restauración documentada) y reset de contraseña (tabla de tokens de reset; el email puede ser opcional/imprimible al inicio).
- **Mes 7+:** #10 (Yjs) solo si la métrica de adopción lo justifica; OIDC/Keycloak para instituciones (roadmap ítem 8 del plan).
- **Principio permanente:** honestidad como diferenciador (el README ya lista lo que falta) y nada de estadísticas inventadas; medir adopción con señales verificables (issues, discussions, réplicas reales), no con dashboards inflados.

---

**Nota de cierre:** cumplí la regla de solo lectura — no creé ni edité ningún archivo en el repo. La auditoría se apoya en tres exploraciones independientes del código (frontend, backend/API, compilador/CI/Docker), la revisión existente en `reviews/graph-review.md`, y búsqueda web para el panorama competitivo; los datos externos de mi conocimiento general están marcados «no verificado».
