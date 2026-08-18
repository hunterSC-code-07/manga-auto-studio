/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: "#111827", // Your deep background color
        cardBg: "#1f2937", // The panel background color
        accent: "#3b82f6"  // The blue highlight color
      }
    },
  },
  plugins: [],
}