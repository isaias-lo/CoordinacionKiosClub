# Estado actual del trabajo

## Última sesión
Fecha: 2026-06-15
Último commit: feat(ux): dark enterprise left panel en /despacho/regiones
Rama: ux-despacho (en progreso — NO mergeada a main todavía)

## Archivos modificados recientemente
src/features/despacho/regiones/pages/TiendasPage.tsx

## En progreso
**Rediseño UX enterprise de /despacho/regiones** — rama `ux-despacho`

Cambios aplicados:
- Panel izquierdo: fondo oscuro navy (#0B1426) estilo sidebar enterprise
- Tarjetas de tienda (TiendaGridCard): glassmorphism sobre fondo oscuro
  (fondo rgba, borde sutil, badges con colores ajustados para contraste sobre oscuro)
- Encabezado de fecha/despacho: dark (elimina el blanco chirriante)
- Barra de búsqueda: input oscuro con texto claro
- Sección HOY: header oscuro con acento rojo
- Sección Todas: header oscuro sutil
- Toolbar multi-PDF: dark
- Dividers redimensionables: acento rojo/gris más limpio

Centro y derecha sin cambios (formulario blanco, resumen blanco/navy ya era correcto).

Todos los tests pasan: 216/216.

## Próximos pasos inmediatos
1. El usuario revisa el diseño en el browser (localhost:3000/despacho/regiones)
2. Si está conforme → abrir PR de ux-despacho → main
3. Posibles ajustes: scrollbar custom en panel oscuro, hover states, etc.

## Backlog (sin urgencia)
1. Deuda diferida: refactor de componentes monolíticos
   (StepForm ~2384 líneas, AuditoriaScreen ~2400).
2. Seguridad menor (preexistente): activar Leaked Password Protection en Supabase Auth.
Plan completo: ~/.claude/plans/un-agente-reviso-el-scalable-hickey.md
