/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#303532",
        muted: "#788079",
        paper: "#FFFDF4",
        sage: "#E3F1EE",
        forest: "#168C98",
        line: "#E8E8DF",
        vincora: { teal: "#168C98", yellow: "#F2B632", orange: "#F49A24", purple: "#873F91", cream: "#FFFDF4" }
      },
      boxShadow: {
        soft: "0 8px 30px rgba(35, 49, 42, 0.05)"
      }
    }
  },
  plugins: []
};
