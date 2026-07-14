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
          DEFAULT: '#2EC4F2',
          bg: '#D6F4FD',
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
