import 'dotenv/config';
import app from './app.js';
import { connectDatabase, closeDatabase } from './config/database.js';
import { seedDemoData } from './seed/demoData.js';
import { syncAlerts } from './services/alertEngine.js';

const port = Number(process.env.PORT || 4000);
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET is required in production.');
await connectDatabase();
// Demo seeding runs in development, or in a production demo deployment that has
// explicitly opted in via ALLOW_LOCAL_DEMO_STORE (an empty store would otherwise
// leave nothing to sign in with).
const shouldSeed = process.env.NODE_ENV !== 'production'
  || process.env.SEED_DEMO_DATA === 'true'
  || process.env.ALLOW_LOCAL_DEMO_STORE === 'true';
const seedResult = shouldSeed ? await seedDemoData() : { seeded: false };
if (seedResult.seeded) console.log(`✓ Seeded DEMO DATA: ${seedResult.mines} mines, ${seedResult.users} users, ${seedResult.compliances} compliances, ${seedResult.inspections} inspections, ${seedResult.violations} violations, ${seedResult.actions} actions.`);
await syncAlerts();
const refreshTimer = setInterval(() => syncAlerts().catch((error) => console.error('Background alert refresh failed:', error)), 5 * 60 * 1000);
refreshTimer.unref();
const server = app.listen(port, '0.0.0.0', () => console.log(`✓ MineGov AI API listening on 0.0.0.0:${port}`));

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  server.close(async () => { await closeDatabase(); process.exit(0); });
});
