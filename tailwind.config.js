import plugin from 'tailwindcss/plugin';

// Consultas por CONTENEDOR (el ancho de la caja, no el de la pantalla). En el Enrutador el ancho
// útil depende del mapa arrastrable y de la tablet (vertical u horizontal): una tabla con `md:`
// se armaba en 5 columnas aunque el mapa le dejara 450 px, y los títulos se encimaban. La caja
// que manda lleva la clase `contenedor`; adentro, `cq-md:` etc. miran ESE ancho.
// Tailwind 3.4 no las trae sin el plugin oficial; esto son las cuatro que se usan.
const consultasContenedor = plugin(({ addUtilities, addVariant }) => {
  addUtilities({ '.contenedor': { 'container-type': 'inline-size' } });
  addVariant('cq-sm', '@container (min-width: 480px)');
  addVariant('cq-md', '@container (min-width: 640px)');
  addVariant('cq-lg', '@container (min-width: 760px)');
  addVariant('cq-xl', '@container (min-width: 960px)');
});

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* ── KiosClub brand (canonical) ── */
        kred:    '#D42B2B',
        knavy:   '#1B2A6B',
        kbg:     '#F2F2F7',
        kcard:   '#ffffff',
        ktext:   '#1C1C1E',
        ktext2:  '#3A3A3C',
        kmuted:  '#8E8E93',
        kgreen:  '#34C759',
        korange: '#FF9500',

        /* ── Semantic aliases — backed by CSS variables for dark mode ── */
        red: {
          DEFAULT: '#D42B2B',
          dark: '#B71C1C',
          soft: 'rgba(212,43,43,0.12)',
        },
        navy: {
          DEFAULT: '#1B2A6B',
          dark: '#0D1829',
        },
        bg: {
          DEFAULT: 'var(--color-bg)',
          2: 'var(--color-bg-2)',
          3: 'var(--color-bg-3)',
        },
        card: 'var(--color-card)',
        text: {
          DEFAULT: 'var(--color-text)',
          2: 'var(--color-text-2)',
          3: 'var(--color-text-3)',
          sub: 'var(--color-text-sub)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          2: 'var(--color-border-2)',
        },

        /* ── shadcn primitive tokens — backed by CSS vars (index.css) ── */
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        input: 'var(--input)',
        ring: 'var(--ring)',

        /* ── Status ── */
        success: '#34C759',
        warn:    '#FF9500',
        info:    '#2563EB',
        danger:  '#D42B2B',

        /* ── Bodega: estado y tipo de unidad (variables en index.css, con modo oscuro) ──
           `est-*` solo para estados; `uni-*` solo para tipos de unidad. No se cruzan. */
        est: {
          ok:            'var(--est-ok)',
          'ok-suave':    'var(--est-ok-suave)',
          aviso:         'var(--est-aviso)',
          'aviso-suave': 'var(--est-aviso-suave)',
          error:         'var(--est-error)',
          'error-suave': 'var(--est-error-suave)',
        },
        uni: {
          pallet:             'var(--uni-pallet)',
          'pallet-suave':     'var(--uni-pallet-suave)',
          bulto:              'var(--uni-bulto)',
          'bulto-suave':      'var(--uni-bulto-suave)',
          contenedor:         'var(--uni-contenedor)',
          'contenedor-suave': 'var(--uni-contenedor-suave)',
          chocolate:          'var(--uni-chocolate)',
          'chocolate-suave':  'var(--uni-chocolate-suave)',
        },

        /* ── Logistics categories ── */
        comida: '#D97706',
        hogar:  '#7C3AED',
        mixto:  '#0891B2',

        /* ── Sidebar ── */
        sidebar: {
          DEFAULT: '#0D1829',
          hover:   'rgba(255,255,255,0.06)',
          active:  'rgba(255,255,255,0.10)',
          border:  'rgba(255,255,255,0.07)',
        },
      },
      /* Escala de Bodega: seis tamaños con nombre, ninguno bajo 12 px. Reemplazan a los
         `text-[Npx]` sueltos (el test `escalaBodega` impide que vuelvan a crecer). */
      fontSize: {
        cifra:  ['28px', { lineHeight: '32px' }],
        titulo: ['20px', { lineHeight: '26px' }],
        cuerpo: ['16px', { lineHeight: '22px' }],
        apoyo:  ['14px', { lineHeight: '20px' }],
        rotulo: ['12px', { lineHeight: '16px', letterSpacing: '0.06em' }],
      },
      fontFamily: {
        barlow:            ['Barlow', 'sans-serif'],
        'barlow-condensed':['Barlow Condensed', 'sans-serif'],
        mono:              ['DM Mono', 'monospace'],
      },
      borderRadius: {
        card:  '12px',
        btn:   '8px',
        kios:  '16px',
        kios2: '10px',
      },
      boxShadow: {
        card:  '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05)',
        card2: '0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.07)',
        kios:  '0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
        input: '0 0 0 3px rgba(212,43,43,0.12)',
      },
      spacing: {
        'sidebar':    '220px',
        'sidebar-sm': '64px',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [consultasContenedor],
}
