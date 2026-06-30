import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['Quicksand', 'system-ui', 'sans-serif'],
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          ink: "hsl(var(--primary-ink))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          ink: "hsl(var(--accent-ink))",
        },
        tertiary: {
          DEFAULT: "hsl(var(--tertiary))",
          foreground: "hsl(var(--tertiary-foreground))",
          ink: "hsl(var(--tertiary-ink))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        logan: {
          jet: "hsl(var(--logan-jet))",
          graphite: "hsl(var(--logan-graphite))",
          red: "hsl(var(--logan-red))",
          cyan: "hsl(var(--logan-cyan))",
          slate: "hsl(var(--logan-slate))",
          frost: "hsl(var(--logan-frost))",
          gold: "hsl(var(--logan-gold))",
          blue: "hsl(var(--logan-blue))",
        },
        brand: {
          magenta: "#FF2E92",
          violet: "#A22BE8",
          teal: "#2BD4D9",
          ink: "#23201C",
          paper: "#F4F1EA",
          night: "#16120E",
        },
        phase: {
          menstruation: "hsl(var(--phase-menstruation))",
          follicular: "hsl(var(--phase-follicular))",
          ovulation: "hsl(var(--phase-ovulation))",
          luteal: "hsl(var(--phase-luteal))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateX(-6px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "ring-pop": {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.04)" },
          "100%": { transform: "scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.24s cubic-bezier(0.22,1,0.36,1)",
        "accordion-up": "accordion-up 0.24s cubic-bezier(0.22,1,0.36,1)",
        "fade-in": "fade-in 0.5s cubic-bezier(0.22,1,0.36,1)",
        "slide-in": "slide-in 0.35s cubic-bezier(0.22,1,0.36,1)",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
        "ring-pop": "ring-pop 0.6s cubic-bezier(0.22,1,0.36,1)",
        "float": "float 4s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
