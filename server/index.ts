import { resolve } from 'node:path';
import { createApp } from './app.ts';
const studio = await createApp(resolve(process.env.MOONJELLY_DATA ?? '.data'));
const server = studio.app.listen(4310, '127.0.0.1', () => console.log('Moonjelly API: http://127.0.0.1:4310'));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { server.close(async () => { await studio.close(); process.exit(0); }); });
