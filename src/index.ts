import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';
import { runAgent } from './agent.js';
async function main(){
  const task = process.argv.slice(2).join(' ') || 'Explore codebase and summarize';
  const workdir = path.resolve(config.workdir);
  if(!fs.existsSync(workdir)){ console.error(`Workdir ${workdir} not found. Clone repo there.`); process.exit(1); }
  await runAgent({ task, workdir });
}
main().catch(console.error);
