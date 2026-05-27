/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        steps: {
          50: '#f5f0fa',
          100: '#ebe0f4',
          200: '#d4bfe6',
          300: '#b892d4',
          400: '#9b63c0',
          500: '#7a3fa5',
          600: '#5A2382',
          700: '#4a1d6b',
          800: '#3a1755',
          900: '#2a113f',
          950: '#1a0b28',
        },
        surface: {
          DEFAULT: '#f7f5f2',
          50: '#fefefe',
          100: '#f7f5f2',
          200: '#eae7e3',
          300: '#ddd9d4',
          400: '#c5c0b9',
        },
      },
    },
  },
  plugins: [],
};

