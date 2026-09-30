/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#0c1426', 900: '#101a31', 800: '#172540', 700: '#22365b' },
        cobalt: { 500: '#3868e8', 600: '#2854d9' },
      },
      fontFamily: { sans: ['DM Sans', 'sans-serif'], display: ['Manrope', 'sans-serif'] },
      boxShadow: { panel: '0 8px 28px rgba(22, 39, 74, .055)' },
    },
  },
  plugins: [],
};
