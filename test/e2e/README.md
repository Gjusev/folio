# E2E — Folio contra el stack real

Runner: `pnpm e2e` (usa `@playwright/test`). Requiere el stack Docker levantado
con el override de desarrollo (compilador publicado en 127.0.0.1:3001) y la web
en 127.0.0.1:3000:

    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
    pnpm e2e

Las credenciales de prueba se crean al vuelo vía la API de registro; cada spec
trabaja sobre proyectos propios sembrados por API y solo usa la UI para el flujo
que prueba (search→citar, grafos, compilación/PDF, lint, synctex, collab).
