# Folio

**Escritura científica en LaTeX, en tu propio servidor.** Folio es un editor LaTeX autoalojable (Apache-2.0) con compilación aislada, búsqueda real de artículos académicos, figuras, plantillas de revista y un asistente de IA compatible con cualquier API de tipo OpenAI (vLLM, Ollama, Mistral, DeepSeek, OpenAI, OpenRouter…).

Tus documentos se guardan en tu Postgres. Cambiar de modelo es cambiar una variable de entorno.

## Por qué Folio (frente a Prism)

Prism de OpenAI cierra el 1 de enero de 2027 y sus críticas repetidas señalan el mismo fondo: es una herramienta en la nube de un solo proveedor. Folio parte de esas críticas:

| Crítica a Prism                                      | Folio                                                                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Solo nube; tus borradores viven en servidores ajenos | Autoalojado: documentos en tu Postgres, compilación en tu máquina                                              |
| Cierre anunciado para 2027                           | Apache-2.0, exportación ZIP de fuentes en todo momento                                                         |
| Compilaciones lentas con errores crípticos           | `latexmk` local en contenedor aislado, en segundos; errores `archivo:línea` que saltan a su línea al pulsarlos |
| La IA altera citas                                   | La IA es opcional y solo cita claves que existen en tu `.bib`; jamás edita sin tu confirmación                 |
| Exportación solo a PDF                               | PDF y ZIP con todas las fuentes                                                                                |
| Sin API ni control                                   | Es tu servidor: API incluida, red del compilador sin salida a Internet                                         |

**Lo que Folio aún no tiene** (honestidad ante todo): edición colaborativa en tiempo real, historial con snapshots estilo git, exportación a DOCX y autocompletado consciente del contexto completo del documento (por ahora: claves de cita y `\label`). Ver [roadmap](IMPLEMENTATION_PLAN.md).

## Qué hace (v0.3)

- **Editor** LaTeX (CodeMirror 6) con autoguardado y control de versiones optimista: si dos pestañas editan el mismo archivo, Folio te pregunta qué versión conservar y nunca sobrescribe en silencio.
- **Autocompletado** de `\cite{}`, `\ref{}`, `\eqref{}` y `\autoref{}` con las claves reales de tu `.bib` y los `\label{}` del proyecto.
- **Compilación** con `latexmk` + BibTeX en un servicio aislado. PDF continuo con zoom, y errores que llevan a su línea al pulsarlos.
- **PDF ↔ código**: haz clic en cualquier frase del PDF y el editor salta a esa línea del fuente.
- **Búsqueda de artículos** unificada en tres motores gratuitos y sin clave (OpenAlex, Semantic Scholar, arXiv): una sola caja, la fuente es un filtro, los resultados se mezclan y deduplican por DOI; también por DOI o identificador de arXiv. Ordena por relevancia, citas o fecha, filtra acceso abierto y añade la cita al `.bib` con un clic.
- **Agente de redacción**: describe una sección («trabajos relacionados sobre atención eficiente»), Folio busca literatura real, la muestra como evidencia y redacta el LaTeX en streaming. Las citas quedan limitadas estructuralmente a claves existentes o a la evidencia recuperada: cualquier clave inventada se elimina en el servidor antes de mostrarte el borrador, y las referencias nuevas solo entran al `.bib` cuando tú aceptas.
- **Grafo de citas** estilo Connected Papers: referencias, citantes y un segundo anillo desde los trabajos más citados, sobre datos CC0 de OpenAlex; tamaño = citas, color = año, y cita cualquier nodo con un clic.
- **Recomendaciones** de artículos a partir de tu bibliografía (Semantic Scholar, con vecinos de OpenAlex como respaldo; el motor se muestra siempre).
- **IA multi-proveedor**: ajustes con presets (OpenRouter con privacidad por defecto, OpenAI, Anthropic nativo, Gemini, Mistral, DeepSeek, xAI, Ollama, vLLM, custom), claves cifradas en reposo (AES-256-GCM) y enrutado por tarea: modelo barato para buscar, fuerte para redactar. Sin perfiles, el `.env` sigue funcionando igual.
- **Figuras**: sube PNG/JPG/PDF arrastrándolos a la lista de archivos; se comprueba que el contenido coincida con el formato y se incluyen al compilar.
- **Plantillas**: artículo, IEEE, Elsevier (elsarticle), REVTeX, AMS, tesis con capítulos y presentación beamer.
- **Importar ZIP**: trae un proyecto de Overleaf, las fuentes de arXiv o el ZIP de exportación de OpenAI Prism tal cual; se detecta el archivo principal y se descarta lo que no compila.
- **Asistente de IA** (opcional): mejorar o explicar la selección, continuar el texto, corregir errores de compilación y preguntar sobre el documento. Solo cita claves que existen en tu `.bib` y no toca el documento sin tu confirmación.
- **Exportación** a PDF y ZIP de fuentes.
- **Interfaz en español, inglés y alemán**: se cambia con un selector y la cookie recuerda tu elección, también en los mensajes de error.
- **Instalable como app** (PWA): «Instalar Folio» en el navegador, sin Electron.

Las decisiones de diseño, el modelo de seguridad y el roadmap están en [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

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

En este modo el compilador está en una red sin salida a Internet y solo la app web puede alcanzarlo. Pon un proxy inverso con TLS (Caddy, nginx, Traefik) delante del puerto 3000. Las cookies de sesión se marcan `Secure` en producción.

## Calidad

```bash
pnpm lint && pnpm typecheck && pnpm format:check
pnpm test             # unitarios + integración contra Postgres (requiere pnpm services:up)

# Pruebas de seguridad y de las 7 plantillas contra el contenedor real:
COMPILER_E2E_URL=http://127.0.0.1:3001 COMPILER_TOKEN=<tu token> pnpm vitest run services/latex-compiler
```

La CI (`.github/workflows/ci.yml`) ejecuta todo lo anterior, incluidas las pruebas de aislamiento del compilador.

## Estructura

```
src/app/            páginas y API (route handlers de Next.js)
src/lib/            dominio: auth, proyectos, importador ZIP, OpenAlex, BibTeX, compilador, IA
src/components/     interfaz (workspace del editor en components/workspace)
services/latex-compiler/   servicio de compilación aislado (sin dependencias)
drizzle/            migraciones SQL versionadas
```

## Licencia

[Apache-2.0](LICENSE). TeX Live se instala en la imagen del compilador a partir de paquetes de Debian y no se redistribuye en este repositorio. El patrón del visor PDF continuo está adaptado de [assistant-ui/open-prism](https://github.com/assistant-ui/open-prism) (MIT).
