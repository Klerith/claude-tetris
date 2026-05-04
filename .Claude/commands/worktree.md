Crea un git worktree aislado y ejecuta las instrucciones dentro de él.

## Pasos a seguir:

1. **Determina el nombre** del worktree basándote en el requerimiento de $ARGUMENTS:

   - Extrae 2-4 palabras clave del requerimiento
   - Conviértelas a kebab-case (minúsculas, guiones)
   - Ejemplo: "agregar animación de líneas" → `line-animation`

2. **Crea el worktree** ejecutando:

   ```
   git worktree add .trees/[nombre]
   ```

3. **Trabaja de forma aislada**: Usa el Agent tool (subagent_type: general-purpose) para ejecutar todo el trabajo dentro del worktree. En el prompt del agente:

   - Indica que el directorio de trabajo es `.trees/[nombre]` (ruta absoluta)
   - Todas las lecturas y ediciones deben hacerse sobre archivos en esa ruta
   - El agente debe realizar el requerimiento completo antes de terminar
   - Al final, el agente debe reportar qué archivos modificó y un resumen del trabajo

4. **Reporta** al usuario: nombre del worktree creado, rama, y resumen del trabajo realizado por el agente.

## Instrucciones para el agente:

El prompt del agente debe incluir:

- Ruta absoluta del worktree
- El requerimiento completo: $ARGUMENTS
- Instrucción de trabajar solo dentro de esa ruta
- Instrucción de NO hacer commits (solo editar archivos)
