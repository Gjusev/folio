# Roadmap de mejoras — síntesis de las 5 reviews (2026-11-03)

Fuentes: `product-instance-review.md` (instancia folio-e0, producto/competencia) · `design-review.md` (UI en vivo, 16 capturas) · `graph-review.md` (visualización) · `code-review.md` (calidad/corrección) · `security-review.md` (AppSec). Todo hallazgo citado fue verificado contra el código por su revisor; el único refutado al reproducirlo (design #2, «Recomendados 404») está marcado.

**Totales**: 35 hallazgos verificados (1 refutado en vivo), 7 huecos de test, 10 mejoras de producto rankeadas.

---

## Acción 0 — antes que nada

**Commitear a git.** Un solo «Initial commit» y todo el trabajo sin versionar (riesgo nº 1 verificado por la auditoría de producto): imposible publicar el repo durante la ventana Prism (cierro 2027-01-01) y riesgo de pérdida catastrófica. Commits atómicos por feature + rama `main` pública.

---

## P0 — Bugs verificados (días, antes de publicar)

| #    | Bug                                                                                                                                                                                                                  | Severidad   | Dónde                                                            | Fix                                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| P0.1 | Búsqueda arXiv multi-palabra parsea como **OR** en vez de AND (`+AND+` se codifica `%2B`): 690.406 resultados basura vs 19.417 correctos — verificado en vivo contra la API                                          | **Crítica** | `src/lib/papers.ts:305`                                          | `terms.join(" AND ")` + test del query string exacto                                                                                           |
| P0.2 | **Pérdida silenciosa del .bib**: ediciones locales sin guardar + pulsar «Citar» → el timer de debounce hace PUT con baseVersion nuevo y **borra del servidor la entrada recién añadida**; el `\cite` queda undefined | Alta        | `document-store.ts:186-194`, `PaperSearch.tsx:179-203`           | `await flush()` del .bib antes del POST de citar; en `replaceFromServer` con ediciones locales, levantar conflicto en vez de rebase silencioso |
| P0.3 | Carrera del `MAX_JOBS` del compilador: el check pasa antes de `readBody` → N latexmk simultáneos, OOM bajo ráfagas                                                                                                   | Alta        | `services/latex-compiler/server.ts:321-334`                      | Reservar slot antes del await, `active--` en try/finally                                                                                       |
| P0.4 | **Bypass de rate-limit por X-Forwarded-For**: `clientIp` lee la primera entrada (controlable) → fuerza bruta del login sin agotar límites                                                                            | Alta        | `src/lib/http.ts:94`                                             | Leer la última entrada de XFF + límite global por email                                                                                        |
| P0.5 | Popovers Exportar/Versiones/Log no cierran con clic fuera y se solapan                                                                                                                                               | Alta        | `Workspace.tsx:454`, `SnapshotsMenu.tsx:116`, `PdfPanel.tsx:150` | Hook `useOutsideClose` + Escape en los 3 `<details>`                                                                                           |
| P0.6 | Pestaña **Asistente inaccesible en móvil** (<900px no existe en `MobileView`)                                                                                                                                        | Alta        | `Workspace.tsx:33`, `:542-559`                                   | Añadir `assistant` a la tablist móvil                                                                                                          |
| P0.7 | `enforceCiteKeys` deja pasar `\textcite`/`\parencite` con claves inventadas — invariante roto con biblatex                                                                                                           | Media       | `ai-prompts.ts:110-111`                                          | Reutilizar la regex de familia de `citation-health.ts`                                                                                         |
| P0.8 | `texEscape` **borra** `\`,`{`,`}` en vez de escapar → títulos con matemáticas corrompidos en el .bib                                                                                                                 | Media       | `bibtex.ts:117`                                                  | Escapar real + test con `$\alpha$`                                                                                                             |
| P0.9 | Errores de consola en vivo: Sigma sin dimensiones al montar, 405 en `/files`, 404 `/files/{id}/raw`                                                                                                                  | Media       | GraphPanel/PdfPanel                                              | Montar sigma con layout medido; auditar métodos de las llamadas `/files`                                                                       |

Tests que cierran los huecos detectados (code review): `replaceFromServer` sucio, `replaceCiteKey`, `removeBibEntry`, `searchAllPapers` merge, `\textcite` en enforceCiteKeys, concurrencia >MAX_JOBS, restore de snapshots.

## P1 — Pulido de grafo, diseño y seguridad (1–2 semanas)

**Grafo** (base sana; arreglos S/M):

- Trío de interacción: highlight del nodo seleccionado SIEMPRE (hoy en modo bib no pasa nada), cámara animada al nodo al clicar filas, **tooltip de hover** con título/venue/citas (graph 3/4/5).
- Rampa de color por año con **luminancia monótona** (viridis-like: sobrevive a grises/daltonismo) + leyenda con gradiente y años (graph 1/2).
- **Determinismo**: PRNG sembrado → el export TikZ es reproducible (graph 6).
- Export TikZ: proporción de áreas fiel (11×→3× hoy), primer autor en etiqueta, umbral de etiquetas size≥6, `\label` parametrizado (graph 8/9/12).
- Clamp de tamaño: divisor `/12` o sqrt(log); semilla marcada por color, no por tamaño (graph 7).

**Diseño**:

- Iconos SVG monocromos (lucide-react: clock/maximize/x/network) + aria-labels en los 30 botones «Grafo», ⏱ y ⤢ (design 5/8).
- Skeletons en búsqueda/snapshots; spinner dentro de `.btn` (design 6).
- `.select` en el sistema de componentes (4 duplicaciones ad hoc) (design 9); `aria-label="Vista"` i18n (10); confirm inline de restaurar en vez de `window.confirm` (7); lápiz en título editable + feedback de guardado móvil (11/12).

**Seguridad/operación** (pre-instancia pública):

- SSRF del proxy LLM: resolver hostname, rechazar IP privadas/loopback salvo whitelist para Ollama (security 2).
- `ALLOW_REGISTRATION` (flag, default off en producción documentada) (security 3).
- `${POSTGRES_PASSWORD:?}` obligatoria, límites de recursos + `cap_drop` para web y db en compose, CSP en next.config (security 4/5 + Docker).
- `abort()` del stream de IA al desmontar AiPanel (code 6).

## P2 — Producto (mes 1–3, orden por palanca)

1. **Ruta de migración Prism**: fixture ZIP de Prism + test e2e + entrada «Importar desde Prism» + subir el bucket de import (10/10min hoy) + landing «Migra en 2 pasos». El gancho comercial decisivo, ya medio construido.
2. **chktex + texcount** en la imagen del compilador (`/lint`, `/count`) → contador de palabras en UI y avisos de estilo.
3. **Persistir conversaciones de IA** (hoy se pierden al recargar; migración 0005).
4. **Duplicar proyecto + buscar/ordenar** la lista.
5. **Compartir proyecto con roles** (owner/editor/lector) — el 70% del valor colaborativo sin CRDT; concentrado en `getOwnedProject`→`getAccessibleProject`.
6. **Checklist de envío por venue** (agrega salud de citas + texcount + `\todo` + figuras).
7. **SyncTeX real** (forward/inverse exacto; hoy heurística de 6 palabras).
8. **Espacio de réplicas** (response letter con el contrato de citas existente).
9. **Sync Zotero** (claves selladas como los perfiles LLM; desbloquea grupos enteros).

## P3 — Grandes (cuando P2 lo justifique)

- **Yjs tiempo real** (solo después de compartir con roles).
- Islas/comunidades del grafo multisequilla (graph 11) + lista «todos los nodos» para a11y.
- RAG sobre PDFs con pgvector (el routing `embed` existe pero nadie lo consume).
- Batería de IA contra modelos reales de pago (pendiente desde la iteración 1 — la promesa central nunca se probó con un modelo de verdad).

---

**Principio rector** (del audit de producto): honestidad como diferenciador — nada de estadísticas inventadas, medir adopción con señales verificables.
