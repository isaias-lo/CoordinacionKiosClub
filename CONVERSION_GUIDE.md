# Guía: Convertir HTML a React con Tailwind CSS

## 📋 Pasos para Convertir tu HTML

### 1. **Analizar el HTML**
Identifica las diferentes secciones y componentes de tu diseño HTML:
- Encabezados y navegación
- Tarjetas de contenido
- Formularios
- Botones
- Listas

### 2. **Crear Componentes**
Para cada sección, crea un componente `.tsx` en `src/components/`:

```typescript
// src/components/MiComponente.tsx
interface MiComponenteProps {
  titulo: string;
  contenido: string;
}

export const MiComponente: React.FC<MiComponenteProps> = ({ titulo, contenido }) => {
  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold">{titulo}</h2>
      <p className="text-gray-600 mt-2">{contenido}</p>
    </div>
  );
};
```

### 3. **Usar Tailwind CSS**
Reemplaza los estilos CSS con clases de Tailwind:

**HTML Original:**
```html
<div style="background-color: white; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px;">
  <h2 style="font-size: 20px; font-weight: 600;">Título</h2>
</div>
```

**Con Tailwind CSS:**
```typescript
<div className="bg-white p-6 rounded-lg shadow">
  <h2 className="text-xl font-semibold">Título</h2>
</div>
```

### 4. **Importar y Usar**
En tu `App.tsx` o en otras páginas:

```typescript
import { MiComponente } from './components/MiComponente';

function App() {
  return (
    <div>
      <MiComponente titulo="Hola" contenido="Contenido" />
    </div>
  );
}
```

## 🎨 Clases Tailwind Comunes

| Propiedad CSS | Tailwind | Ejemplo |
|---|---|---|
| `background-color` | `bg-*` | `bg-white`, `bg-blue-500` |
| `padding` | `p-*` | `p-4`, `p-6`, `px-8` |
| `margin` | `m-*` | `m-2`, `mx-auto` |
| `text-align` | `text-*` | `text-center`, `text-left` |
| `font-size` | `text-*` | `text-sm`, `text-lg`, `text-2xl` |
| `font-weight` | `font-*` | `font-bold`, `font-semibold` |
| `display` | `flex`, `grid` | `flex`, `grid` |
| `border-radius` | `rounded-*` | `rounded`, `rounded-lg` |
| `box-shadow` | `shadow` | `shadow`, `shadow-lg` |

## 📁 Estructura de Carpetas Recomendada

```
src/
├── components/           # Componentes reutilizables
│   ├── Header.tsx
│   ├── Button.tsx
│   ├── Card.tsx
│   └── index.ts
├── pages/               # Páginas completas
│   ├── Home.tsx
│   └── Dashboard.tsx
├── App.tsx              # Componente principal
├── main.tsx             # Punto de entrada
└── index.css           # Estilos globales
```

## 🚀 Comandos Útiles

```bash
# Iniciar servidor de desarrollo
npm run dev

# Compilar para producción
npm run build

# Preview de producción
npm run preview
```

## ✅ Checklist para Convertir HTML

- [ ] Identificar todos los componentes
- [ ] Crear archivo `.tsx` para cada componente
- [ ] Convertir estilos CSS a Tailwind
- [ ] Crear props/interfaces para datos dinámicos
- [ ] Importar en `App.tsx`
- [ ] Probar en el navegador
- [ ] Optimizar y refactorizar

## 📚 Recursos Útiles

- [Documentación de Tailwind CSS](https://tailwindcss.com/docs)
- [Documentación de React](https://react.dev)
- [Documentación de Vite](https://vitejs.dev)
- [TypeScript en React](https://react.dev/learn/typescript)

¡Estás listo para convertir tu HTML en componentes React profesionales! 🎉
