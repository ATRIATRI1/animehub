/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        line: 'var(--border)',
        ink: 'var(--text)',
        muted: 'var(--text-2)',
        accent: 'var(--accent)',
        accent2: 'var(--accent-2)',
        pop: 'var(--pop)',
        plan: 'var(--c-plan)',
        watch: 'var(--c-watch)',
        done: 'var(--c-done)',
        hold: 'var(--c-hold)',
        drop: 'var(--c-drop)',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'Noto Sans SC', 'sans-serif'],
      },
      boxShadow: {
        card: 'var(--shadow)',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        pop: {
          '0%': { transform: 'scale(.96)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        fadeUp: 'fadeUp .35s ease both',
        pop: 'pop .2s ease both',
      },
    },
  },
  plugins: [],
};
