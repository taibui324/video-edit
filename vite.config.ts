import { defineConfig } from 'vite';
export default defineConfig({ server: { port: Number(process.env.MOONJELLY_WEB_PORT ?? 5173), strictPort: true, proxy: { '/api': `http://127.0.0.1:${process.env.MOONJELLY_API_PORT ?? 4310}` } } });
