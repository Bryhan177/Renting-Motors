/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        // Alineado con home / login / register
        primary: {
          DEFAULT: '#0c0e10',
          light: '#f2efe8',
          'dark-light': 'rgba(232,163,23,.15)',
        },
        secondary: {
          DEFAULT: '#e8a317',
          light: '#f5d78a',
          'dark-light': 'rgba(232,163,23,0.15)',
        },
        // Grises más carbón (menos azul) para el panel
        gray: {
          950: '#08090a',
          900: '#0c0e10',
          800: '#15191e',
          700: '#1e242b',
          600: '#2a323c',
          500: '#6b7280',
          400: '#9aa3ad',
          300: '#c4cad1',
          200: '#e5e7eb',
          100: '#f2efe8',
          50: '#f8f6f1',
        },
      },
    },
  },
  plugins: [],
};
