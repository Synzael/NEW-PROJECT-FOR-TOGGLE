/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#101418',
        paper: '#f6f8f8',
        slate: '#2e383f',
        accent: '#0f766e',
        warn: '#f59e0b',
        danger: '#ef4444'
      },
      fontFamily: {
        sans: ['"Space Grotesk"', '"Segoe UI"', 'sans-serif']
      }
    }
  },
  plugins: []
};
