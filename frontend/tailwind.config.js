/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    fontFamily: {
      sans: [
        'Figtree',
        'ui-sans-serif',
        'system-ui',
        '-apple-system',
        'BlinkMacSystemFont',
        'Segoe UI',
        'sans-serif',
      ],
    },
    extend: {
      colors: {
        bg: {
          primary: 'var(--md-sys-color-surface)',
          secondary: 'var(--md-sys-color-surface-container-lowest)',
          tertiary: 'var(--md-sys-color-surface-container)',
        },
        text: {
          primary: 'var(--md-sys-color-on-surface)',
          secondary: 'var(--md-sys-color-on-surface-variant)',
          tertiary: 'var(--md-sys-color-on-surface-variant)',
          muted: 'var(--text-muted)',
        },
        accent: {
          primary: 'var(--md-sys-color-primary)',
          secondary: 'var(--md-sys-color-tertiary)',
          light: 'var(--md-sys-color-primary-container)',
        },
        border: {
          primary: 'var(--md-sys-color-outline-variant)',
          muted: 'var(--border-muted)',
        },
        card: {
          DEFAULT: 'var(--md-sys-color-surface-container-lowest)',
          hover: 'var(--md-sys-color-surface-container)',
        },
        neon: {
          accent: 'var(--md-sys-color-primary)',
          bg: 'var(--md-sys-color-primary-container)',
          border: 'var(--neon-border)',
        },
        comp: {
          bg: 'var(--md-sys-color-tertiary-container)',
          border: 'var(--comp-border)',
        },
        error: {
          bg: 'var(--md-sys-color-error-container)',
          border: 'var(--error-border)',
          text: 'var(--md-sys-color-on-error-container)',
        },
        speaker: {
          a: 'var(--md-sys-color-primary)',
          'a-bg': 'var(--md-sys-color-primary-container)',
          b: 'var(--md-sys-color-tertiary)',
          'b-bg': 'var(--md-sys-color-tertiary-container)',
        },
        human: {
          DEFAULT: 'var(--md-sys-color-tertiary)',
          bg: 'var(--md-sys-color-tertiary-container)',
        },
        md: {
          primary: 'var(--md-sys-color-primary)',
          'on-primary': 'var(--md-sys-color-on-primary)',
          surface: 'var(--md-sys-color-surface)',
          'on-surface': 'var(--md-sys-color-on-surface)',
          'surface-container': 'var(--md-sys-color-surface-container)',
          outline: 'var(--md-sys-color-outline)',
        },
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      backgroundImage: {
        'app-gradient': 'var(--bg-gradient)',
        'accent-gradient': 'var(--accent-gradient)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
