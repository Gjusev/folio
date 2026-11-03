# Review de diseño UI/UX — Folio (auditoría en vivo + código)

> Review de un agente especialista en UI con auditoría en vivo (16 capturas) sobre el stack real de :3000 (2026-11-03).
> **Nota de verificación (sesión principal):** el hallazgo #2 fue reproducido y resultó **falso positivo** — `POST /api/projects/:id/recommendations` responde **200 OK** con resultados reales (verificado en vivo desde el navegador autenticado); la cadena «Endpoint no implementado» no existe en el repo y el error de consola era residuo de una sesión de dev anterior en otro puerto. El punto genérico (no mostrar errores crudos al usuario) sigue siendo válido como principio.

## Veredicto

Folio tiene un sistema de diseño real y maduro para ser pre-commit: tokens completos light/dark en `globals.css` (accent teal `#1b6c80`, IBM Plex, base 14px), componentes `.btn/.input/.pill/.tab/.sheet` usados con una disciplina rara, focus visible global y cero overflow horizontal a 375px. Los problemas graves no son de sistema visual sino de interacción: popovers `<details>` que se solapan al no cerrarse con clic fuera, un error 404 con trace de código expuesto al usuario, iconos Unicode sin aria-label y la pestaña Asistente que desaparece en móvil. La base es sólida; el pulido necesario es quirúrgico.

## Hallazgos

| # | Severidad | Hallazgo | Evidencia | Arreglo concreto |
|---|-----------|----------|-----------|------------------|
| 1 | Alta | Los popovers Exportar, Versiones ⏱ y Log del PDF (`<details>`) no se cierran con clic fuera ni interactuando con la página: llegué a tener Exportar + Versiones abiertos simultáneos superpuestos sobre las pestañas laterales | `05-tab-articulos.png` (popover Versiones abierto sobre la pestaña Artículos); `src/components/workspace/Workspace.tsx:454`, `SnapshotsMenu.tsx:116`, `PdfPanel.tsx:150` | Un hook `useOutsideClose(ref)` (listener `pointerdown` en `document` que hace `ref.current.open = false`) aplicado a los 3 `<details>`; añadir cierre en Escape |
| 2 | ~~Alta~~ **refutado** | ~~«Recomendados para ti» muestra un error crudo con trace de código~~ — **no reproducible**: el endpoint responde 200 OK (verificación en vivo de la sesión principal). El error de la captura era una entrada de consola residual de una sesión dev previa. Sub-principio válido: traducir errores crudos a mensajes humanos, nunca exponer `file:line` | `16-recomendados-404.png` (captura del estado stale) | No renderizar botones de endpoints caídos; mapear errores a mensajes i18n |
| 3 | Alta | Errores JS reales en consola en :3000: `Sigma: Container has no height/width` al montar/desmontar el grafo (SigmaContainer se inicializa antes de que el modal tenga layout); `405 Method Not Allowed` en `/files` y `/files/{id}`; `409 Conflict` al guardar; `404 /files/{id}/raw` (deja el visor PDF sin contenido) | `browser_console_messages`; el propio `globals.css:159-161` documenta el problema de CSS de Sigma pero el error de dimensiones sigue ocurriendo | Diferir el montaje de `SigmaContainer` un frame (o montar cuando `getBoundingClientRect().height > 0`); auditar los métodos de las llamadas a `/files` (405 = GET/POST cruzados) |
| 4 | Alta | La pestaña «Asistente» (agente de redacción) es inaccesible por debajo de 900px: `MobileView` solo incluye files/editor/pdf/papers y la tablist móvil no la renderiza | `Workspace.tsx:33` (`type MobileView = "files" \| "editor" \| "pdf" \| "papers"`) y `:542-559` | Añadir `"assistant"` a `MobileView` y a la tablist móvil; o un segmented control de 5 tabs |
| 5 | Alta | Botones de solo icono sin nombre accesible: ⏱ (solo `title`), ⤢/⤡ (texto del botón es el glifo), y los 30 botones «Grafo» de resultados sin `aria-label` — un lector de pantalla anuncia "botón, ⏱" treinta veces seguidas | Verificado con evaluate (0 aria-label en botones Grafo); `SnapshotsMenu.tsx:117`, `GraphPanel.tsx:408` | `aria-label={t("papers.graph.open", {title})}` en cada Grafo; `aria-label` + texto sr-only en ⏱ y ⤢ (ya tiene `aria-expanded`, falta el nombre) |
| 6 | Media | Todos los estados de carga son texto plano («Cargando…», «Buscando…»): sin skeleton ni spinner en búsqueda (latencia de 3 APIs externas), snapshots, ni compile. La lista previa desaparece y aparece una línea de texto | `PaperSearch.tsx:439`, `:334`, `SnapshotsMenu.tsx:136`, `PdfPanel.tsx:8`; `09/06-*.png` muestran el patrón | Un skeleton de 3 filas (`animate-pulse` sobre `.sheet` con alturas fijas) para PaperSearch; para botones, un spinner CSS de 12px dentro del `.btn` en vez de reemplazar el label |
| 7 | Media | `window.confirm` nativo para confirmar restaurar versión — diálogo del SO gris que rompe el lenguaje visual (todo lo demás usa pills/banners) | `SnapshotsMenu.tsx:86` | Mismo patrón del banner de conflicto de `Workspace.tsx:330-343`: inline con dos `.btn btn-sm` Restaurar/Cancelar, o un dialog `.sheet` modal |
| 8 | Media | Iconografía inconsistente: ⏱ es emoji a color en Windows (rompe la paleta monocroma piedra/teal), ✕ y ⤢ son glifos de texto, y el resto de botones no tienen icono. No hay set de iconos | `04-menu-snapshots.png` (⏱ color); `SnapshotsMenu.tsx:118`, `:177`, `GraphPanel.tsx:408` | Un set SVG 16px stroke=`currentColor` (lucide-react ya es coherente con el stack): `clock`, `maximize/minimize`, `x`, `network` — elimina emojis a color de golpe |
| 9 | Media | Clases de select duplicadas ad-hoc: `h-7 rounded-md border border-control bg-surface px-1.5 text-xs` repetida 3 veces en PaperSearch y una variante `input h-7 w-auto` en AiPanel — fuera del sistema `.input` | `PaperSearch.tsx:383`, `:399`, `:418`; `AiPanel.tsx:460` | Añadir `.select` a `@layer components` en `globals.css` (mismo patrón que `.input` con `h-7` opcional) y reemplazar las 4 ocurrencias |
| 10 | Media | `aria-label="Vista"` hardcodeado en español en la tablist móvil — rompe i18n para lectores de pantalla en en/de (todo lo demás pasa por `t()`) | `Workspace.tsx:540` | `aria-label={t("ws.view")}` con la clave añadida a los 3 diccionarios |
| 11 | Baja | El título del proyecto es editable pero no lo parece: input sin borde ni icono de lápiz, solo un tenue `hover:bg-active`. En 375px el nombre largo se apila en 2 líneas y compite con los 3 botones de acción | `15-editor-375px.png`; `Workspace.tsx:436-444` | Un lápiz SVG 12px `text-muted` al lado (como hace Notion/Overleaf) o borde punteado en hover; en móvil, truncar a 1 línea (`line-clamp-1`) |
| 12 | Baja | La pill de estado de guardado («Guardado» + punto de 6px) se oculta bajo 640px (`hidden sm:flex`) y su dot `h-1.5 w-1.5` es casi invisible: el usuario móvil edita sin feedback de guardado | `Workspace.tsx:445-452`; `14-editor-1280px.png` | Mostrar en móvil solo el dot (12px, con `title`) o un toast al guardar; subir el dot a 8px |

## Quick wins de diseño

1. **Cierre de popovers con clic fuera** (hallazgo 1): ~15 líneas en un hook reutilizable eliminan el solapamiento de menús, la sensación de "roto" al navegar, y aplican a los 3 popovers existentes.
2. **Set de iconos SVG monocromo + aria-labels** (hallazgos 5 y 8): un solo cambio (`lucide-react`, 5 iconos) arregla accesibilidad, consistencia visual y el emoji a color de ⏱ simultáneamente.
3. **Skeleton en resultados de búsqueda** (hallazgo 6): 3 barras `animate-pulse` con las alturas reales de las filas hacen que la espera de OpenAlex/S2/arXiv se sienta diseñada en vez de vacía.

## Capturas

- `01-projects-dashboard.png` — dashboard /projects: cabecera stone + hoja blanca, chips de plantilla, jerarquía correcta.
- `02-editor-workspace.png` — workspace 3 paneles: lateral (Archivos), editor main.tex con gutter, panel PDF en estado vacío «Sin compilar».
- `03-menu-exportar.png` — popover Exportar: «PDF (compila primero)» deshabilitado + «Fuentes en ZIP».
- `04-menu-snapshots.png` — popover ⏱ Versiones con estado vacío «Aún no hay instantáneas» (⏱ emoji a color visible).
- `05-tab-articulos.png` — pestaña Artículos con el popover Versiones aún abierto encima (evidencia del hallazgo 1).
- `06-busqueda-articulos.png` — resultados de «residual learning image recognition»: pills OA/DOI/PDF, botones Citar/Grafo.
- `07-grafo-panel-lateral.png` — grafo ResNet en modal con 3 columnas previos|grafo|derivados.
- `08-grafo-pantalla-completa.png` — ⤢ pantalla completa: columnas clamp(150px,17vw,230px), leyenda inferior, nodo semilla en teal.
- `09-salud-citas.png` — Salud de citas: 4 entradas .bib con pills OK verdes y métricas de citación.
- `10-mi-bibliografia.png` — Mi bibliografía: lista con pills de estado por entrada.
- `11-settings.png` — /settings en español: Preferencias + Perfiles LLM con estado vacío.
- `12-settings-en.png` — /settings en inglés: cambio de idioma sin romper layout.
- `13-editor-en.png` — workspace completo en inglés (Files/Papers/Assistant): i18n correcto, nada cortado.
- `14-editor-1280px.png` — resize a 1280px: 3 paneles se mantienen; «Mi biblio…» truncado en la fila de chips.
- `15-editor-375px.png` — resize a 375px: header apilado, tabs móviles Archivos/Editor/PDF/Artículos (sin Asistente — hallazgo 4), cero overflow horizontal (verificado con `scrollWidth === clientWidth`).
- `16-recomendados-404.png` — captura del estado stale del hallazgo 2 (refutado en verificación en vivo).

Notas adicionales verificadas: dark mode EXISTE completo vía `prefers-color-scheme` (`globals.css:39-67`, tokens dedicados) aunque sin toggle manual; focus visible verificado en vivo (`outline: 2px solid rgb(27,108,128)`); contraste AA amplio (ink #141413 sobre blanco 16.7:1, muted #5d5c58 ~7:1, accent #1b6c80 ~5.9:1); panel lateral mide 345px a viewport 1600 (rango 270-430 cumplido; se ensancha a 32% al abrir Asistente). Los errores de consola del puerto :3210 (500 + MIME + Jest worker) son de una sesión de dev server anterior, no del stack actual en :3000.
