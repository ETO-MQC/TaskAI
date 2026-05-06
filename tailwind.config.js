/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        q1: "#EF4444",
        q2: "#F59E0B",
        q3: "#3B82F6",
        q4: "#9CA3AF",
      },
      boxShadow: {
        glow: "0 0 30px rgba(59, 130, 246, 0.18)",
      },
    },
  },
  plugins: [],
};
