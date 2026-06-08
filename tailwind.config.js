/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
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

        /* ── Semantic aliases (kept for backward compat) ── */
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
          DEFAULT: '#F2F2F7',
          2: '#E8E8ED',
          3: '#D8D8DC',
        },
        card: '#FFFFFF',
        text: {
          DEFAULT: '#1C1C1E',
          2: '#3A3A3C',
          3: '#8E8E93',
        },
        border: {
          DEFAULT: '#D8DCE6',
          2: '#C8CDD8',
        },

        /* ── Status ── */
        success: '#34C759',
        warn:    '#FF9500',
        info:    '#2563EB',
        danger:  '#D42B2B',

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
  plugins: [],
}
