# Estado actual del trabajo

## Última sesión
Fecha: 2026-06-15
Último commit: feat(ux): dark enterprise left panel en /despacho/regiones
Rama: ux-despacho (en progreso — NO mergeada a main todavía)

## Archivos modificados recientemente
src/features/despacho/regiones/pages/TiendasPage.tsx

## En progreso
**Rediseño UX enterprise v2 de /despacho/regiones** — rama `ux-despacho`

Principio aplicado: monocromático serio (Linear/Vercel/Bloomberg), no colorido.

Cambios:
- TiendaGridCard: dark flat (#0c1220), borde izq rojo solo si activa, código en font-mono
  blanco, nombre muted, conteos "2P · 1B" en font-mono monocromático (sin badges colores)
- Dot de Odoo: movido a esquina derecha, 6px, sin ring, solo verde/ámbar funcional
- Stats footer: numbers mono blancos, labels tracking-widest muted, sin azul/amarillo/verde
- Botón Enrutador: flat, sin gradiente ni ícono decorativo, solo texto + flecha pequeña
- Botón RESUMEN: rojo plano sin box-shadow dramático
- Sección HOY: thin red strip + texto mono minúsculo "Hoy"
- Sección Todas: thin grey strip + texto mono minúsculo "Todas"
- Multi-PDF: botón plano dashed, mono, sin drama
- HOY chips: pequeños tags mono flat, selected=rojo sólido
- BottomBar: monocromático, sin border-red, sin shadow
- Mobile Resumen overlay: header oscuro flat sin gradientes

216/216 tests pasan.

## Próximos pasos inmediatos
1. El usuario revisa en browser (localhost:3000/despacho/regiones)
2. Si conforme → PR
3. Posibles ajustes según feedback visual

## Backlog (sin urgencia)
1. Deuda diferida: refactor de componentes monolíticos
   (StepForm ~2384 líneas, AuditoriaScreen ~2400).
2. Seguridad menor (preexistente): activar Leaked Password Protection en Supabase Auth.
Plan completo: ~/.claude/plans/un-agente-reviso-el-scalable-hickey.md
