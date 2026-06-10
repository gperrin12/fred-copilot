import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        fred: {
          navy: "#003366",
          blue: "#0066cc",
          light: "#e8f0f8",
        },
      },
    },
  },
  plugins: [],
};

export default config;
