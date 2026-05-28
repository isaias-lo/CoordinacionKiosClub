# Instrucciones para Claude — Cambios pendientes

Aplica los siguientes 5 cambios al proyecto. Verifica cada archivo antes de editar, asegúrate de no introducir errores ni romper funcionalidades existentes. Aplica uno por uno y confirma que no hay errores de TypeScript antes de hacer commit.

---

## Cambio 1 — Checkbox: tiendas desmarcadas no vuelven a marcarse solas

**Archivo:** `src/features/despacho/estado/EstadoPage.tsx`

**Causa:** `rebuild()` se ejecuta cada vez que `appState` cambia (polling periódico a Supabase) y re-agrega al set `printCods` todas las tiendas, incluyendo las que el usuario desmarcó.

**Fix:** Agregar `userUncheckedRef = useRef<Set<string>>(new Set())` al componente. Usarlo en tres lugares:

1. En `rebuild()`, cambiar la condición de inserción:
```typescript
// Antes:
if (!next.has(s.cod)) next.add(s.cod);
// Después:
if (!next.has(s.cod) && !userUncheckedRef.current.has(s.cod)) next.add(s.cod);
```

2. En el handler `onCheck` de cada tienda:
```typescript
onCheck={v => {
  if (!v) userUncheckedRef.current.add(s.cod);
  else userUncheckedRef.current.delete(s.cod);
  setPrintCods(prev => { const next = new Set(prev); v ? next.add(s.cod) : next.delete(s.cod); return next; });
}}
```

3. Botón "Desmarcar todas": agrega todas al ref antes de vaciar el set.  
   Botón "Marcar todas": limpia `userUncheckedRef.current` antes de marcar.

---

## Cambio 2 — Navegación ← contextual en Bodega Santiago

**Archivo 1:** `src/features/despacho/santiago/context/SantiagoContext.tsx`

Agregar a la unión `SantiagoAction`:
```typescript
| { type: 'BACK_TO_REGIMEN' }
```
Agregar case en el reducer:
```typescript
case 'BACK_TO_REGIMEN':
  return { ...state, step: 'regimen', currentTienda: null };
```

**Archivo 2:** `src/screens/SantiagoScreen.tsx`

Importar `useSantiago`. En `SantiagoContent` obtener `state` y `dispatch`:
```typescript
const { state, dispatch } = useSantiago();
```
Reemplazar el onClick del botón ← por:
```typescript
const handleBack = () => {
  if (state.step === 'form') {
    dispatch({ type: 'BACK_TO_REGIMEN' });
  } else {
    router.push('/despacho/conteo');
  }
};
```

---

## Cambio 3 — Guías PDF sincronizadas entre dispositivos

**Archivo:** `src/lib/userSessionState.ts`

Agregar `'guides'` al tipo `Fuente`:
```typescript
type Fuente = 'regiones' | 'santiago' | 'guides';
```

**Archivo:** `src/features/despacho/estado/EstadoPage.tsx`

- Importar `pushSessionState` junto a los demás imports de `userSessionState`.
- Agregar tipo: `type GuideEntry = { fileName: string; guias: string[]; totalSum: number; driveFileId?: string }`.
- Al montar, agregar `useEffect` que: (1) llama `fetchSessionState('guides')` y fusiona con `localStorage`, (2) si hay guías locales nuevas las sube automáticamente con `pushSessionState('guides', merged)`, (3) suscribe con `subscribeToSessionState('guides', '', callback)`.
- En cada `handleFiles` y `removeGuide`: llamar `pushSessionState('guides', newGuides).catch(() => {})`.

---

## Cambio 4 — PDFs de NACIONAL activan QR en Estado/Seguimiento

**Archivo:** `src/features/despacho/estado/EstadoPage.tsx`

Agregar `useEffect` que observe `appState.pdfData`. Por cada tienda en `pdfData`, si no existe guía manual en `guides` para esa tienda, agregarla y sincronizar:

```typescript
useEffect(() => {
  const pdfData = appState.pdfData;
  if (!pdfData || Object.keys(pdfData).length === 0) return;
  setGuides(prev => {
    const next = { ...prev };
    let changed = false;
    Object.entries(pdfData).forEach(([tiendaName, pdf]) => {
      const t = TIENDAS[tiendaName];
      if (!t || next[t.cod]) return;
      next[t.cod] = { fileName: pdf.fileName, guias: pdf.guias.map(g => g.num), totalSum: pdf.totalSum };
      changed = true;
    });
    if (!changed) return prev;
    saveGuides(next);
    pushSessionState('guides', next).catch(() => {});
    rebuild(next, appState.dispatch);
    return next;
  });
}, [appState.pdfData]);
```

---

## Cambio 5 — Zona de subida de guías PDF en Bodega Santiago

**Archivo:** `src/features/despacho/santiago/steps/StepForm.tsx`

Nuevos imports:
```typescript
import { fetchSessionState, subscribeToSessionState, pushSessionState } from '@/lib/userSessionState';
import { processPdf } from '../../regiones/utils/pdfUtils';
```

Nuevas constantes y tipos:
```typescript
const todayKey = new Date().toISOString().split('T')[0];
const GUIDES_KEY = `estadoGuias_${todayKey}`;
type GuideEntry = { fileName: string; guias: string[]; totalSum: number };
function loadGuides(): Record<string, GuideEntry> { /* leer desde localStorage[GUIDES_KEY] */ }
function saveGuides(g: Record<string, GuideEntry>) { /* guardar a localStorage[GUIDES_KEY] */ }
```

Nuevo estado en el componente:
```typescript
const [guides, setGuides] = useState<Record<string, GuideEntry>>(loadGuides);
const [guideUploading, setGuideUploading] = useState(false);
const guideFileRef = useRef<HTMLInputElement>(null);
```

Agregar `useEffect` de sync igual al de EstadoPage (fetch inicial + suscripción realtime a `'guides'`).

Agregar `handleGuideFiles(files: FileList)`: llama `processPdf(file)` por cada PDF, busca la tienda en el array de tiendas Santiago por código/nombre, guarda en `guides`, `localStorage` y `pushSessionState('guides', ...)`.

En `TiendaGridCard` agregar prop `hasGuide?: boolean`:
- Fondo y borde cuando `hasGuide && !isActive`: `bg-[rgba(22,163,74,0.07)] border border-success`
- Color texto: `isActive ? 'text-red' : hasGuide ? 'text-success' : 'text-navy'`

En el panel izquierdo (entre tabs RM/COSTA y la grilla), agregar zona drag & drop:
- `<input type="file" accept=".pdf" multiple ref={guideFileRef} />`
- Al reconocer la tienda el tile pasa de rojo a verde
- Chips verdes muestran los folios cargados

Pasar `hasGuide={!!guides[t.cod]}` a cada `TiendaGridCard` en vista HOY y TODAS.

---

**Notas:**
- Aplica Cambio 3 primero (agrega `'guides'` a `Fuente`) antes que los demás, o habrá errores de tipo.
- `processPdf` ya existe en `src/features/despacho/regiones/utils/pdfUtils.ts`.
- `TIENDAS` es el diccionario de tiendas ya existente en el contexto de Santiago.
