/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe',
          300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6',
          600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a',
        },
        navy: {
          50:  '#f0f4fa',
          100: '#dce6f4',
          200: '#b9cceb',
          300: '#88aadc',
          400: '#5683c8',
          500: '#3463b0',
          600: '#244d96',
          700: '#1e3e7a',
          800: '#1b3366',
          900: '#0f2240',
          950: '#071529',
        },
        gold: {
          50:  '#fdfaed',
          100: '#f9f0c5',
          200: '#f4df8e',
          300: '#eec84d',
          400: '#e6b020',
          500: '#c9921a',
          600: '#a97214',
          700: '#875513',
          800: '#714416',
          900: '#613918',
        },
        water: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'float':     'float 6s ease-in-out infinite',
        'fade-up':   'fadeUp 0.4s ease-out forwards',
        'shimmer':   'shimmer 2s linear infinite',
        'wave':      'wave 8s linear infinite',
      },
      keyframes: {
        float:   { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        fadeUp:  { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        wave:    { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
      },
      backgroundImage: {
        'gov-pattern': "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Ccircle cx='20' cy='20' r='1'/%3E%3C/g%3E%3C/svg%3E\")",
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,.08), 0 12px 32px rgba(0,0,0,.06)',
        'sidebar': '4px 0 24px rgba(7,21,41,.18)',
        'topbar': '0 1px 0 rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.04)',
      },
    },
  },
  plugins: [],
}
