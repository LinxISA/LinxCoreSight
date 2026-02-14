/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme - Circuit/Tech Aesthetic
        'janus': {
          'bg-primary': '#0a0e14',
          'bg-secondary': '#111820',
          'bg-tertiary': '#1a2332',
          'border': '#2d3a4d',
          'accent-cyan': '#00d9ff',
          'accent-orange': '#ff6b35',
          'accent-green': '#00ff88',
          'accent-red': '#ff4757',
          'accent-purple': '#a855f7',
          'accent-yellow': '#fbbf24',
          'text-primary': '#e6edf3',
          'text-secondary': '#8b949e',
          'text-muted': '#6e7681',
        }
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
        'sans': ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'xs': '11px',
        'sm': '13px',
        'base': '14px',
        'lg': '16px',
        'xl': '18px',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0, 217, 255, 0.3)',
        'glow-orange': '0 0 20px rgba(255, 107, 53, 0.3)',
        'glow-green': '0 0 20px rgba(0, 255, 136, 0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 217, 255, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 217, 255, 0.4)' },
        }
      }
    },
  },
  plugins: [],
}
