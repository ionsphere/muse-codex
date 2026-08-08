import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { detectPlatform } from './platforms/index.js';
import { runAgent } from './agent.js';

function parseArgs(argv: string[]) {
  const taskParts: string[] = [];
  let platform: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--platform') {
      platform = argv[++i];
      if (!platform) throw new Error('--platform requires a value');
    } else {
      taskParts.push(argv[i]);
    }
  }

  return {
    task: taskParts.join(' ') || 'Explore codebase and summarize',
    platform,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.platform) process.env.MUSE_PLATFORM = args.platform;

  const platform = detectPlatform();
  const workdir = path.resolve(config.workdir);
  if (!fs.existsSync(workdir) || !fs.statSync(workdir).isDirectory()) {
    console.error(`Workdir ${workdir} not found. Set WORKDIR to an existing repository directory.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Selected platform: ${platform.id} (${platform.label})`);
  await runAgent({ task: args.task, workdir });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
