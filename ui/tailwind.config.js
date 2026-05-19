/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:      '#0c0c0e',
        surface: '#111115',
        card:    '#18181d',
        border:  'rgba(255,255,255,0.07)',
      },
      backgroundImage: {
        'hero-glow': 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(249,115,22,0.14) 0%, transparent 60%)',
        'card-glow':  'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(249,115,22,0.09) 0%, transparent 70%)',
      },
    },
  },
  plugins: [],
};
