/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        industrial: {
          dark: '#121418',
          card: '#1a1d24',
          border: '#2a2f3a',
          accent: '#2563eb',
          ok: '#16a34a',
          nok: '#dc2626',
          warning: '#eab308',
          waiting: '#0284c7'
        }
      }
    },
  },
  plugins: [],
}
