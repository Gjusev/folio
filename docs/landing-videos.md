# Landing media — the promo film, cut into fragments

The landing is the promo film (`C:\Code Main\Folio-videos\promo\`, outside the repo) laid
out as a page; design notes in `docs/landing-design.md`. `Folio-videos/tools/cut-fragments.sh`
cuts `renders/folio-promo-clean.mp4` (the caption-free render, `CLEAN=1 python build.py`)
into the fragments below, plus `film.mp4` = the full 57 s film with its sound for the
"watch the film" dialog. Every word on the page is translated HTML; the fragments carry none.

## Inventario (`public/landing/promo/`)

| archivo         | dura  | recorte (px del render 1920×1080)         | qué muestra                                                 |
| --------------- | ----- | ----------------------------------------- | ----------------------------------------------------------- |
| `compile.mp4`   | 5,9 s | frame completo                            | el editor sube, clic en Compilar y el PDF aparece           |
| `search.mp4`    | 6,5 s | panel Papers (860×1000)                   | búsqueda "layer normalization", resultados y Citar          |
| `turn.mp4`      | 8,3 s | frame completo, **sin b-frames** (`-g 4`) | el giro: 93 papers → dispersión → rejilla → borrador citado |
| `assistant.mp4` | 5,3 s | panel del asistente (900×560)             | pregunta y respuesta que llega línea a línea                |
| `review.mp4`    | 5,2 s | panel de revisión (1040×1020)             | resumen, puntuaciones y el comentario que cita main.tex:28  |
| `fix.mp4`       | 5,8 s | escena de error (860×930)                 | Compilation failed → parche rojo/verde → recompilado        |
| `ship.mp4`      | 4,4 s | menús (1000×1040)                         | compartir, exportar (ZIP/arXiv) y versiones                 |
| `model.mp4`     | 4,4 s | frame completo                            | ajustes: proveedores de IA y reparto por tarea              |
| `film.mp4`      | 57 s  | frame completo, **con audio**             | la película entera para el diálogo «Ver la película»        |

Cada `.mp4` tiene su póster `.jpg` (frame del propio clip). Total ≈ 5 MB de fragmentos
mudos + 8,4 MB la película. La película con rótulos vive fuera del repo
(`Folio-videos/renders/folio-promo.mp4`), lista para redes.

## Notas

- H.264 `faststart`, CRF 23–24; `turn.mp4` se codifica con GOP de 4 frames porque el
  scrub por scroll pide `currentTime` aleatorios: con b-frames normales cada seek
  redecodifica un GOP entero y el movimiento se ve a saltos.
- Los bucles (`LoopVideo`) solo se reproducen en pantalla y con movimiento permitido;
  `film.mp4` carga solo al abrir el diálogo y tiene controles nativos y sonido.
- `prefers-reduced-motion`: los bucles se quedan en el póster y el giro muestra su
  fotograma final con los tres pasos a la vez.
