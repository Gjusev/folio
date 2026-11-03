# Contribuir a Folio

¡Gracias por tu interés! Folio es un proyecto Apache-2.0. Al enviar una contribución aceptas que se publique bajo esa licencia y certificas el [Developer Certificate of Origin](https://developercertificate.org/): firma tus commits con `git commit -s`.

## Flujo de trabajo

1. Abre un issue antes de cambios grandes. Las decisiones de arquitectura se discuten como propuesta (RFC) en un issue y se reflejan en `IMPLEMENTATION_PLAN.md`.
2. Crea una rama desde `main`.
3. Prepara el entorno según el [README](README.md) (`pnpm services:up`, `pnpm db:migrate`).
4. Antes de abrir el PR, comprueba que todo pasa:
   ```bash
   pnpm format && pnpm lint && pnpm typecheck && pnpm test
   ```
5. Describe en el PR qué cambia, por qué y cómo lo has verificado.

## Criterios

- **Funcionalidades verticales completas**: UI, API validada con Zod, persistencia, errores comprensibles y pruebas.
- **Cambios de esquema** mediante `pnpm db:generate`, revisando y commiteando el SQL generado en `drizzle/`. Nunca edites migraciones ya publicadas.
- **Autorización en el servidor**: toda consulta a proyectos o archivos se filtra por propietario (`getOwnedProject`).
- **IA**: el modelo nunca decide permisos ni ejecuta acciones. El contenido del documento se trata como dato no confiable.
- **Compilador**: cualquier cambio en `services/latex-compiler` debe mantener en verde las pruebas e2e de aislamiento.
- **Dependencias**: solo licencias compatibles con Apache-2.0 (MIT, BSD, Apache, ISC). Evita AGPL y GPL en el código distribuido.
- **Interfaz**: textos en español claro, accesibilidad básica (etiquetas, foco visible, navegación con teclado) y diseño responsive.

## Seguridad

No abras issues públicos para vulnerabilidades. Sigue [SECURITY.md](SECURITY.md).
