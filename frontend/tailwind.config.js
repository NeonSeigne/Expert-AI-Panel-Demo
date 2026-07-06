/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          tertiary: 'var(--bg-tertiary)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          muted: 'var(--text-muted)',
        },
        accent: {
          primary: 'var(--accent-primary)',
          secondary: 'var(--accent-secondary)',
          light: 'var(--accent-light)',
        },
        border: {
          primary: 'var(--border-primary)',
          muted: 'var(--border-muted)',
        },
        card: {
          DEFAULT: 'var(--card-bg)',
          hover: 'var(--card-hover)',
        },
        neon: {
          accent: 'var(--neon-accent)',
          bg: 'var(--neon-bg)',
          border: 'var(--neon-border)',
        },
        comp: {
          bg: 'var(--comp-bg)',
          border: 'var(--comp-border)',
        },
        error: {
          bg: 'var(--error-bg)',
          border: 'var(--error-border)',
          text: 'var(--error-text)',
        },
        speaker: {
          a: 'var(--speaker-a-color)',
          'a-bg': 'var(--speaker-a-bg)',
          b: 'var(--speaker-b-color)',
          'b-bg': 'var(--speaker-b-bg)',
        },
        human: {
          DEFAULT: '#16A34A',
          bg: '#F0FDF4',
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
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
