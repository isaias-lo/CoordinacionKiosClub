/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* ── kiosclub-react enrutador ── */
        kred:    '#D42B2B',
        knavy:   '#1B2A6B',
        kbg:     '#F2F2F7',
        kcard:   '#ffffff',
        ktext:   '#1C1C1E',
        ktext2:  '#3A3A3C',
        kmuted:  '#8E8E93',
        kgreen:  '#34C759',
        korange: '#FF9500',
        /* ── existing ── */
        red: {
          DEFAULT: '#D32F2F',
          dark: '#B71C1C',
          soft: 'rgba(211,47,47,0.12)',
        },
        navy: {
          DEFAULT: '#1A2550',
          dark: '#111A3E',
        },
        bg: {
          DEFAULT: '#F4F5F7',
          2: '#EAECF0',
          3: '#DDE0E7',
        },
        card: '#FFFFFF',
        text: {
          DEFAULT: '#1A2550',
          2: '#4A5568',
          3: '#8896A8',
        },
        border: {
          DEFAULT: '#D8DCE6',
          2: '#C8CDD8',
        },
        success: '#16A34A',
        warn: '#D97706',
        info: '#2563EB',
        comida: '#D97706',
        hogar: '#7C3AED',
        mixto: '#0891B2',
      },
      fontFamily: {
        barlow: ['Barlow', 'sans-serif'],
        'barlow-condensed': ['Barlow Condensed', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
        kios:  '16px',
        kios2: '10px',
      },
      boxShadow: {
        card: '0 2px 8px rgba(26,37,80,0.10)',
        card2: '0 4px 20px rgba(26,37,80,0.15)',
        kios: '0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
      },
    },
  },
  plugins: [],
}
