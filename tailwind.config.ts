import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#eef1f9",
          100: "#d5dcf0",
          200: "#aab9e1",
          300: "#7f96d2",
          400: "#5473c3",
          500: "#3456b0",
          600: "#2a448d",
          700: "#22366e",
          800: "#1B2E6B",
          900: "#142254",
          DEFAULT: "#1B2E6B",
        },
        brand: {
          orange: "#E8521A",
          navy: "#1B2E6B",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
