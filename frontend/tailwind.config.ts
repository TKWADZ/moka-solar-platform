import type { Config } from 'tailwindcss';
const config: Config = { content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'], theme: { extend: { colors: { panel: '#0b1220', line: 'rgba(255,255,255,0.08)' }, boxShadow: { soft: '0 20px 80px rgba(0,0,0,0.35)' } } }, plugins: [] };
export default config;
