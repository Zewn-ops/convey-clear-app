import type { Config } from "tailwindcss";

const config: Config = {
  // Our theme is set by data-theme on <html>, not by the OS preference, so the
  // dark: variant has to follow the attribute or it fires at the wrong times.
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic tokens -> src/styles/tokens.css. These resolve per theme,
        // so `text-required` is the right orange in light AND dark without a
        // dark: variant at every call site.
        canvas: "var(--cc-canvas)",
        surface: "var(--cc-surface)",
        raised: "var(--cc-raised)",
        line: "var(--cc-border)",
        "line-strong": "var(--cc-border-strong)",
        ink: "var(--cc-text)",
        "ink-2": "var(--cc-secondary)",
        "ink-3": "var(--cc-muted)",
        action: "var(--cc-action)",
        required: "var(--cc-required)",
        waiting: "var(--cc-waiting)",
        ok: "var(--cc-ok)",
        danger: "var(--cc-danger)",
        "action-tint": "var(--cc-action-tint)",
        "required-tint": "var(--cc-required-tint)",
        "waiting-tint": "var(--cc-waiting-tint)",
        "ok-tint": "var(--cc-ok-tint)",
        "danger-tint": "var(--cc-danger-tint)",
        "action-fill": "var(--cc-action-fill)",
        "required-fill": "var(--cc-required-fill)",
        "waiting-fill": "var(--cc-waiting-fill)",
        "ok-fill": "var(--cc-ok-fill)",
        "danger-fill": "var(--cc-danger-fill)",
        chrome: "var(--cc-chrome)",
        // The text colour that belongs ON chrome. The token has existed since
        // the 2026-08-05 regeneration; only `chrome` itself was ever exposed to
        // Tailwind, so anything sitting on the navy had to hardcode white.
        "on-chrome": "var(--cc-on-chrome)",
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
      borderRadius: { DEFAULT: "var(--cc-radius)", lg: "var(--cc-radius-lg)", sm: "var(--cc-radius-sm)" },
      boxShadow: {
        sm: "var(--cc-shadow-sm)",
        DEFAULT: "var(--cc-shadow)",
        lg: "var(--cc-shadow-lg)",
        chip: "var(--cc-shadow-chip)",
      },
      transitionTimingFunction: { out: "var(--cc-ease)" },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
