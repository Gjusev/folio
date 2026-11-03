# Política de seguridad

## Notificar una vulnerabilidad

Usa los **avisos de seguridad privados de GitHub** (pestaña _Security_ → _Report a vulnerability_) del repositorio. No publiques detalles en issues. Confirmaremos la recepción en un plazo de 5 días laborables y coordinaremos la divulgación tras publicar la corrección.

## Modelo de amenazas (resumen)

| Superficie            | Control                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LaTeX no confiable    | Servicio separado, red sin salida, rootfs de solo lectura, sin capacidades, límites de memoria, pids y tiempo, sin `\write18`, `openin_any=p`/`openout_any=p`, `latexmk -norc`, rutas validadas. Pruebas e2e en CI |
| Acceso a datos        | Todas las consultas se filtran por propietario. Los IDs ajenos devuelven 404                                                                                                                                       |
| Sesiones              | Token aleatorio de 256 bits, con solo su SHA-256 en BD. Cookie `HttpOnly`, `SameSite=Lax` y `Secure` en producción                                                                                                 |
| Contraseñas           | scrypt (N=2^17, r=8, p=1) con sal y comparación en tiempo constante                                                                                                                                                |
| CSRF                  | Comprobación de `Origin` en métodos mutantes, cuerpos JSON obligatorios y `SameSite=Lax`                                                                                                                           |
| Abuso                 | Límites de peticiones en login, registro, compilación, IA y Crossref                                                                                                                                               |
| IA (prompt injection) | El modelo no tiene herramientas ni permisos. El documento se marca como dato. Los cambios requieren confirmación del usuario                                                                                       |
| SSRF                  | OpenAlex usa un host fijo; la entrada del usuario solo llega como texto de búsqueda o un id validado (`W\d+`), nunca como URL. El endpoint LLM lo fija el operador, no el usuario                                  |
| Importación de ZIP    | Límites antes y después de descomprimir (50 MB), rutas validadas igual que el resto del proyecto, formatos comprobados por firma de bytes. Nada del ZIP toca el disco de la app                                    |
| Figuras servidas      | Solo formatos comprobados al subir; respuesta con `Content-Security-Policy: sandbox` para que nada servido ejecute script                                                                                          |     |

Límites conocidos (v0.1): el rate limiting está en memoria (una sola instancia) y los trabajos de compilación de distintos usuarios comparten contenedor, uno tras otro. Ver `IMPLEMENTATION_PLAN.md` §4.
