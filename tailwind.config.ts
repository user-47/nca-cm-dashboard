import type { Config } from "tailwindcss";

/**
 * Every colour and font here points at a CSS variable. Nothing is hardcoded,
 * so a church rebrands by overriding tokens (orgs.theme_json) with no code
 * change. The default New Covenant values live in globals.css.
 */
/**
 * Tokens are plain hex in CSS variables, which Tailwind cannot split into
 * channels for its `/50` opacity modifiers. color-mix does the same job and
 * keeps the variable indirection, so `text-ink-muted/60` still works and a
 * church can still rebrand by overriding one custom property.
 */
const token = (name: string) =>
  `color-mix(in srgb, var(${name}) calc(<alpha-value> * 100%), transparent)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: token("--ink"),
          muted: token("--ink-muted"),
        },
        paper: token("--paper"),
        surface: token("--surface"),
        brass: {
          DEFAULT: token("--brass"),
          hi: token("--brass-hi"),
        },
        forest: token("--forest"),
        success: token("--success"),
        warning: token("--warning"),
        error: token("--error"),
        line: "var(--line)",
      },
      fontFamily: {
        display: "var(--font-display)",
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      fontSize: {
        // The type scale: 12 / 14 / 16 / 20 / 28 / 40
        xs: ["0.75rem", { lineHeight: "1.1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.25rem", { lineHeight: "1.75rem" }],
        xl: ["1.75rem", { lineHeight: "2.125rem" }],
        "2xl": ["2.5rem", { lineHeight: "2.875rem" }],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(27, 36, 48, 0.06), 0 1px 8px rgba(27, 36, 48, 0.04)",
        raised: "0 2px 4px rgba(27, 36, 48, 0.08), 0 8px 24px rgba(27, 36, 48, 0.08)",
      },
      keyframes: {
        // The one motion the job cards use while a render is in flight.
        "working-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "working-pulse": "working-pulse 1.8s ease-in-out infinite",
        "fade-up": "fade-up 180ms ease-out",
      },
      transitionTimingFunction: {
        strip: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
