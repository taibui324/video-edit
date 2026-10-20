import { resolve } from 'node:path';
import { createApp } from './app.ts';
const studio = await createApp(resolve(process.env.MOONJELLY_DATA ?? '.data'));
const port = Number(process.env.MOONJELLY_API_PORT ?? 4310);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('MOONJELLY_API_PORT must be a port between 1024 and 65535.');
const server = studio.app.listen(port, '127.0.0.1', () => console.log(`Moonjelly API: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { server.close(async () => { await studio.close(); process.exit(0); }); });
