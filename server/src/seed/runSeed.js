import 'dotenv/config';
import { connectDatabase } from '../config/database.js';
import { seedDemoData } from './demoData.js';

await connectDatabase();
const result = await seedDemoData({ force: process.argv.includes('--force') });
console.log(result);
process.exit(0);
