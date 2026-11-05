# Vídeos de la landing — inventario y mapa de colocación

Los nueve vídeos renderizados (HyperFrames, `C:\Code Main\Folio-videos\`, fuera del
repo) en versión web: H.264 + `faststart`, sin pista de audio (mudos por diseño),
bucle a 30 fps, recodificados al tamaño de su hueco. Origen: capturas reales del
producto y del proyecto demo (*Attention in Neural Networks: a Reading Note*);
los textos de botones y nombres de herramientas salen del código.

## Inventario (`public/landing/videos/`)

| archivo | dura | resolución | peso | póster | qué muestra |
|---|---|---|---|---|---|
| `launch.mp4` | 20 s | 1600×900 | 3,5 MB | `launch-poster.jpg` | Se teclea «Folio.», «Prism» se vuelve bloque de tinta, la prensa imprime el LaTeX como paper, las referencias salen en abanico y se abren en el grafo real, «Write with … you can audit», cierre con logo. |
| `ai-diffs.mp4` | 10 s | 1600×900 | 0,5 MB | `ai-diffs-poster.jpg` | Diff propuesto por la IA; una cita inventada se tacha con «not in your .bib · removed»; «Apply changes». |
| `pdf-source.mp4` | 10 s | 1280×720 | 0,9 MB | reutilizar `landing/editor-source.jpg` | Clic en el PDF y el editor salta a la línea del fuente (SyncTeX). |
| `literature-graph.mp4` | 10 s | 1280×720 | 0,7 MB | reutilizar `landing/graph-explorer.jpg` | Grafo de círculos numerados que se abre en el explorador de literatura real. |
| `prism-import.mp4` | 10 s | 1280×720 | 0,4 MB | `prism-import-poster.jpg` | El ZIP de Prism se abre, se descartan los artefactos de compilación y los archivos llegan al árbol real. |
| `reviewer.mp4` | 10 s | 1280×720 | 0,4 MB | `reviewer-poster.jpg` | Panel de revisión real; la cita se despeja del texto y acaba en el comentario. |
| `error-fix.mp4` | 10 s | 1280×720 | 0,3 MB | `error-fix-poster.jpg` | Error en la línea 12, «Fix error», el parche y «Apply and recompile». |
| `versions-latexdiff.mp4` | 10 s | 1280×720 | 0,4 MB | `versions-poster.jpg` | Mazo de versiones, «Compare with» y la página marcada al estilo latexdiff. |
| `own-agent-mcp.mp4` | 10 s | 1280×720 | 0,3 MB | `own-agent-mcp-poster.jpg` | Claude Code usando las herramientas MCP reales de Folio y la edición llegando al editor. |

Total: **≈ 7,5 MB de vídeo + 0,4 MB de pósters** (los originales a 1080p pesaban 45 MB).
El reel de 80 s (`folio-features-reel.mp4`, 20 MB) queda fuera a propósito: los ocho
clips lo cubren con carga perezosa.

## Aspecto claro/oscuro

Cada clip alterna dos lienzos: **tarjetas de título sobre fondo casi negro** (con el
marcador «NN / 08» y acento teal) y **beats de producto sobre fondo crema claro** (la
UI capturada es el tema claro; el tema oscuro de la app llegó después de las
capturas). Los pósters heredan eso: `launch`, `ai-diffs`, `reviewer`, `error-fix`,
`versions`, `own-agent-mcp` son crema; `prism-import` es oscuro con el panel claro.
Sobre una landing siempre oscura, los pósters crema leen como pantallas encendidas;
si se quieren clips con UI oscura nativa, hay que volver a renderizar en HyperFrames
(`features/gen.py`, `python gen.py`).

## Mapa de colocación propuesto (el diseño nuevo decide)

1. **Ventana grande bajo el héroe** → `ai-diffs.mp4`, póster `editor.jpg`: la promesa
   del titular («IA que puedes auditar») demostrada en el frame más grande de la página.
2. **Stages «Escribe» / «Explora»** → `pdf-source.mp4` / `literature-graph.mp4`, con
   los JPG existentes de póster. El frame ya se remonta por stage (`key`), así que el
   vídeo se monta y reproduce al entrar.
3. **Sección Prism** → `prism-import.mp4` junto a los tres pasos: la afirmación
   «importamos tu ZIP tal cual» con su prueba.
4. **Reel de la sección del nombre** → `launch.mp4` en el hueco del letterpress (misma
   metáfora prensa→papel, pero nuestra y con cierre de logo). Si se retira
   `letterpress.webm`, actualizar `landing.foot.credit` (×3 idiomas) y `README.md:282`,
   que lo acreditan, y `landing.folio.reel`.
5. **Cuatro escenas antes del cierre** → `reviewer`, `error-fix`, `versions-latexdiff`,
   `own-agent-mcp` como tira de contacto con una línea de título por frame.

## Títulos y captions (es / en / de)

| clave propuesta | es | en | de |
|---|---|---|---|
| sección 5 | En movimiento | In motion | In Bewegung |
| reviewer | La revisión cita tu .bib | The review cites your .bib | Das Review zitiert dein .bib |
| error-fix | El error, con su arreglo | The error, with its fix | Der Fehler, mit seiner Lösung |
| versions-latexdiff | Versiones marcadas con latexdiff | Versions marked with latexdiff | Versionen mit latexdiff markiert |
| own-agent-mcp | Tu agente edita por MCP | Your agent edits over MCP | Dein Agent bearbeitet über MCP |
| launch (caption) | Folio en veinte segundos | Folio in twenty seconds | Folio in zwanzig Sekunden |
| ai-diffs (aria) | El asistente propone un cambio como diff y rechaza una cita que no está en el .bib | The assistant proposes a change as a diff and rejects a citation that is not in the .bib | Der Assistent schlägt eine Änderung als Diff vor und verwirft ein Zitat, das nicht im .bib ist |
| prism (caption) | El ZIP de Prism llega al árbol de archivos | The Prism ZIP lands in the file tree | Das Prism-ZIP landet im Dateibaum |

## Notas técnicas

- `LoopVideo` (`src/components/landing/LoopVideo.tsx`) ya hace todo el trabajo: mudo,
  en bucle, `IntersectionObserver` (play al 25 % visible, pausa fuera), póster fijo
  bajo `prefers-reduced-motion`, `preload="metadata"`. Solo acepta `webm`; basta
  generalizar el prop a `src`/`mime` (o añadir `mp4`) para servir estos H.264.
- Todos los clips son 16:9: encajan en los frames actuales (2400×1350, 1600×900, 854×480)
  sin cambiar el layout ni el CLS; el póster ocupa el hueco antes de la reproducción.
- Concurrency: el IO pausa lo que sale de pantalla; lo peor realista es 2 vídeos
  simultáneos, y los clips pequeños van a 720p para abaratar el decode.
- Sin audio por diseño. Si algún día lleva música, hay que montarla en HyperFrames
  (no silenciar en el navegador a posteriori un clip con pista).

## Honestidad del material

Contenido de capturas y del proyecto demo; los nombres de herramientas y textos de
botones salen del código. Las tarjetas de diff, error y terminal son
**reconstrucciones** fieles (no había capturas de esas pantallas) y el botón «Review»
del clip 4 está retocado a activo (la sesión capturada no tenía IA configurada). Los
captions describen la función, no afirman «captura real»; mantener esa línea si se
reescriben.
