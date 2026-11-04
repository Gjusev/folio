# Folio

**Escritura científica en LaTeX, en tu propio servidor.** Folio es un editor LaTeX autoalojable (Apache-2.0) con compilación aislada, exploración real de literatura académica, figuras, plantillas de revista y un asistente de IA compatible con cualquier API de tipo OpenAI (vLLM, Ollama, Mistral, DeepSeek, OpenAI, OpenRouter…).

Tus documentos se guardan en tu Postgres. Cambiar de modelo es cambiar una variable de entorno.

|                                 Editor                                 |                          Explorador de literatura                          |
| :--------------------------------------------------------------------: | :------------------------------------------------------------------------: |
| ![Editor con PDF, lint y contador de palabras](screenshots/editor.png) | ![Grafo de similitud con timeline y ficha](screenshots/graph-explorer.png) |

## ¿Vienes de Prism? Migra en dos pasos

Prism cierra el **1 de enero de 2027** y borra los datos. Tu trabajo no tiene por qué irse con él:

1. En Prism: **Settings → Data Controls → Export all** (ZIP con tus fuentes).
2. En Folio: crea una cuenta, **Importar ZIP** — el importador acepta el export de Prism tal cual (hay un test e2e que lo verifica con un fixture del formato), detecta el archivo principal y descarta los artefactos que no compilan. También sirve para proyectos de Overleaf y fuentes de arXiv.

A partir de ahí: documentos en tu Postgres, exportación ZIP en todo momento y Apache-2.0.

## Por qué Folio (frente a Prism)

| Crítica a Prism                                      | Folio                                                                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Solo nube; tus borradores viven en servidores ajenos | Autoalojado: documentos en tu Postgres, compilación en tu máquina                                              |
| Cierre anunciado para 2027                           | Apache-2.0, exportación ZIP de fuentes en todo momento                                                         |
| Compilaciones lentas con errores crípticos           | `latexmk` local en contenedor aislado, en segundos; errores `archivo:línea` que saltan a su línea al pulsarlos |
| La IA altera citas                                   | La IA es opcional y solo cita claves que existen en tu `.bib`; jamás edita sin tu confirmación                 |
| Exportación solo a PDF                               | PDF y ZIP con todas las fuentes                                                                                |
| Sin API ni control                                   | Es tu servidor: API incluida, red del compilador sin salida a Internet                                         |

**Lo que Folio aún no tiene** (honestidad ante todo): exportación a DOCX, autocompletado consciente del contexto completo del documento (por ahora: claves de cita y `\label`), y la colaboración en tiempo real es experimental y opt-in (`COLLAB_URL`; requiere el relay de `services/collab`). Ver [roadmap](IMPLEMENTATION_PLAN.md).

## Qué hace

- **Editor** LaTeX (CodeMirror 6) con autoguardado y control de versiones optimista: si dos pestañas editan el mismo archivo, Folio te pregunta qué versión conservar y nunca sobrescribe en silencio.
- **Autocompletado** de `\cite{}`, `\ref{}`, `\eqref{}` y `\autoref{}` con las claves reales de tu `.bib` y los `\label{}` del proyecto.
- **Compilación** con `latexmk` + BibTeX en un servicio aislado. PDF continuo con zoom, errores que llevan a su línea al pulsarlos, **lint** (`chktex`) y **contador de palabras** (`texcount`) integrados.
- **PDF ↔ código exacto**: haz clic en cualquier frase del PDF y el editor salta a esa línea del fuente (SyncTeX; y al revés: desde un error, el PDF salta a la página).
- **Búsqueda de artículos** unificada en tres motores gratuitos y sin clave (OpenAlex, Semantic Scholar, arXiv): una sola caja, la fuente es un filtro, los resultados se mezclan y deduplican por DOI; también por DOI o identificador de arXiv. Ordena por relevancia, citas o fecha, filtra acceso abierto y añade la cita al `.bib` con un clic.
- **Explorador de literatura** estilo Connected Papers: el grafo es de **similitud** (acoplamiento bibliográfico + co-citación + citación directa), no una estrella de citas. Clic en un nodo para su ficha completa (abstract, resumen en una frase, temas, enlaces, relación con el origen); doble clic para explorar desde ese paper — con historial para volver. Listas de previos/derivados, **línea temporal** por años e **islas rotuladas** en el grafo de tu bibliografía.
- **Biblioteca del proyecto**: todas tus entradas `.bib` con citada/sin usar, filtro, y salto a la línea exacta del editor.
- **Salud de citas y revisión de envío**: claves sin definir, entradas sin usar, mejora de preprint de arXiv a versión publicada (con verificación conservadora), marcadores `\todo` olvidados, figuras rotas, resumen/palabras clave y recuento de palabras — un informe con veredicto.
- **Agente de redacción**: describe una sección («trabajos relacionados sobre atención eficiente»), Folio busca literatura real, la muestra como evidencia y redacta el LaTeX en streaming. Las citas quedan limitadas estructuralmente a claves existentes o a la evidencia recuperada: cualquier clave inventada se elimina en el servidor antes de mostrarte el borrador, y las referencias nuevas solo entran al `.bib` cuando tú aceptas. También genera un **plan por secciones** que queda guardado en el proyecto.
- **RAG sobre tus documentos** (opcional): indexa tus `.tex`/`.bib` con el modelo de embeddings de tu proveedor y el asistente responde con los fragmentos relevantes de tu propio proyecto como contexto.
- **Recomendaciones** de artículos a partir de tu bibliografía (Semantic Scholar, con vecinos de OpenAlex como respaldo; el motor se muestra siempre).
- **Versiones (snapshots)**: guarda el estado del proyecto con etiqueta, compara con un **diff visual latexdiff** (PDF con añadidos/eliminaciones marcados) y restaura con deshacer automático.
- **Compartir con roles**: invita por email a coautores como editores o lectores (los lectores compilan y exportan, no escriben).
- **Colaboración en tiempo real** (experimental, opt-in): edición concurrente con cursores remotos sobre Yjs y Ctrl+Z que solo deshace tus propios cambios.
- **IA multi-proveedor**: ajustes con presets (OpenRouter con privacidad por defecto, OpenAI, Anthropic nativo, Gemini, Mistral, DeepSeek, xAI, Ollama, vLLM, custom), claves cifradas en reposo (AES-256-GCM) y enrutado por tarea: modelo barato para buscar, fuerte para redactar. Sin perfiles, el `.env` sigue funcionando igual.
- **Figuras**: sube PNG/JPG/PDF arrastrándolos a la lista de archivos; se comprueba que el contenido coincida con el formato y se incluyen al compilar.
- **Plantillas**: artículo, IEEE, Elsevier (elsarticle), REVTeX, AMS, tesis con capítulos, presentación beamer y carta de respuesta a revisores.
- **Exportación** a PDF y ZIP de fuentes, y **grafo → TikZ** para incluir la figura en el propio paper.
- **Interfaz en español, inglés y alemán**: se cambia con un selector y la cookie recuerda tu elección, también en los mensajes de error.
- **Instalable como app** (PWA): «Instalar Folio» en el navegador, sin Electron.

Las decisiones de diseño, el modelo de seguridad y el roadmap están en [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md); el historial por entregas con su verificación, en [`CHANGELOG.md`](CHANGELOG.md).

## Requisitos

- Node.js ≥ 24 y pnpm (`corepack enable`)
- Docker (Postgres y el compilador LaTeX; no necesitas TeX instalado)

## Puesta en marcha (desarrollo)

```bash
pnpm install
cp .env.example .env
# Genera un secreto para el compilador y ponlo en COMPILER_TOKEN:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

pnpm services:up      # Postgres + compilador LaTeX (la primera vez construye la imagen TeX, unos minutos)
pnpm db:migrate       # crea las tablas
pnpm dev              # http://localhost:3000
```

Abre la app, crea una cuenta y elige una plantilla. La búsqueda de artículos funciona sin ninguna clave.

### Activar la IA

Configura un endpoint compatible con OpenAI en `.env` y reinicia `pnpm dev`:

```bash
# Local, sin coste, con Ollama vía Docker:
docker compose --profile ollama up -d ollama
docker compose exec ollama ollama pull qwen3:4b      # o qwen3:0.6b en máquinas modestas
# .env
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_MODEL=qwen3:4b

# O un proveedor:
LLM_BASE_URL=https://api.mistral.ai/v1
LLM_API_KEY=...
LLM_MODEL=mistral-small-latest
```

Sin `LLM_BASE_URL`, el resto de Folio funciona igual y el panel del asistente explica cómo activarlo.

## Despliegue autoalojado (todo en Docker)

```bash
cp .env.example .env   # define COMPILER_TOKEN, POSTGRES_PASSWORD y, opcionalmente, LLM_*
docker compose --profile app up -d --build
# http://127.0.0.1:3000  (las migraciones se aplican al arrancar)
```

Para guardar claves de proveedores desde la página de Ajustes, define también `LLM_CREDENTIALS_KEY` (cifra las claves en la base de datos; si lo rotas, hay que reintroducirlas). Las suscripciones de consumidor (ChatGPT Plus, Claude Pro, Gemini AI Pro) no pueden usarse por API desde una app: solo claves API.

¿Perdiste la contraseña de tu instancia? No hay enlace de recuperación (Folio no asume servidor de correo): el administrador la restablece en el servidor con `pnpm reset-password usuario@ejemplo.org`.

En este modo el compilador está en una red sin salida a Internet y solo la app web puede alcanzarlo. Pon un proxy inverso con TLS (Caddy, nginx, Traefik) delante del puerto 3000. Las cookies de sesión se marcan `Secure` en producción.

## Calidad

```bash
pnpm lint && pnpm typecheck && pnpm format:check
pnpm test             # unitarios + integración contra Postgres (requiere pnpm services:up)
pnpm e2e              # flujos reales en navegador contra el stack (citas, grafo, editor, collab)

# Pruebas de seguridad y de las plantillas contra el contenedor real:
COMPILER_E2E_URL=http://127.0.0.1:3001 COMPILER_TOKEN=<tu token> pnpm vitest run services/latex-compiler
```

La CI (`.github/workflows/ci.yml`) ejecuta todo lo anterior, incluidas las pruebas de aislamiento del compilador.

## Estructura

```
src/app/            páginas y API (route handlers de Next.js)
src/lib/            dominio: auth, proyectos, importador ZIP, grafo de similitud, IA, RAG
src/components/     interfaz (workspace, explorador de grafos, pestaña de artículos)
services/latex-compiler/   servicio de compilación aislado (sin dependencias)
services/collab/    relay WebSocket de edición colaborativa (opt-in)
drizzle/            migraciones SQL versionadas
```

## Licencia

[Apache-2.0](LICENSE). TeX Live se instala en la imagen del compilador a partir de paquetes de Debian y no se redistribuye en este repositorio. El patrón del visor PDF continuo está adaptado de [assistant-ui/open-prism](https://github.com/assistant-ui/open-prism) (MIT).
