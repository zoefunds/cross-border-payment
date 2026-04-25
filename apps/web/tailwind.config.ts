import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Syne", "sans-serif"],
        body:    ["DM Sans", "sans-serif"],
      },
      colors: {
        bg:      "#080808",
        card:    "#111111",
        border:  "#222222",
        green:   "#00e5a0",
        yellow:  "#f5c842",
        red:     "#ff4d4d",
      },
    },
  },
  plugins: [],
};

export default config;
