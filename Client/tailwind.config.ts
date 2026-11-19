import type { Config } from 'tailwindcss'

// Theme C: Neon Glass (see Documentations/screens.md.pdf).
// To change the theme later, only edit the tokens in this file and src/index.css.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'rgb(var(--color-base) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-soft': 'rgb(var(--color-surface-soft) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        workspace: 'rgb(var(--color-workspace) / <alpha-value>)',
        editor: 'rgb(var(--color-editor) / <alpha-value>)',
        'editor-ink': 'rgb(var(--color-editor-ink) / <alpha-value>)',
        'editor-line': 'rgb(var(--color-editor-line) / <alpha-value>)',
        'console-head': 'rgb(var(--color-console-head) / <alpha-value>)',
        violet: '#7C3AED',
        cyan: '#06B6D4',
        pink: '#F472B6',
        ok: '#34D399',
        bad: '#FB7185',
        warn: '#FBBF24',
        run: '#60A5FA',
        flag: '#C084FC',
      },
      fontFamily: {
        display: ['"Space Grotesk Variable"', 'system-ui', 'sans-serif'],
        sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'monospace'],
      },
      backgroundImage: {
        brand: 'linear-gradient(135deg, #7C3AED, #06B6D4)',
      },
      borderRadius: { card: '16px', ctl: '12px' },
      boxShadow: {
        glow: '0 0 24px rgba(124,58,237,.35)',
        'glow-cyan': '0 0 24px rgba(6,182,212,.30)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(.34,1.3,.64,1)',
      },
    },
  },
  plugins: [],
} satisfies Config
