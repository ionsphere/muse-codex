import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { config, setRuntimeApiKey } from './config.js';
import { detectPlatform } from './platforms/index.js';
import { runAgent } from './agent.js';
import { authStatus, ensureMetaCredential, loginMeta, logoutMeta } from './auth/meta-auth.js';

type Command = 'run' | 'login' | 'logout' | 'auth-status';

function parseArgs(argv: string[]) {
  let command: Command = 'run';
  let start = 0;
  if (argv[0] === 'login') { command = 'login'; start = 1; }
  else if (argv[0] === 'logout') { command = 'logout'; start = 1; }
  else if (argv[0] === 'auth' && argv[1] === 'status') { command = 'auth-status'; start = 2; }

  const taskParts: string[] = [];
  let platform: string | undefined;

  for (let i = start; i < argv.length; i++) {
    if (argv[i] === '--platform') {
      platform = argv[++i];
      if (!platform) throw new Error('--platform requires a value');
    } else {
      taskParts.push(argv[i]);
    }
  }

  return {
    command,
    task: taskParts.join(' ') || 'Explore codebase and summarize',
    platform,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === 'login') {
    const apiKey = await loginMeta();
    setRuntimeApiKey(apiKey);
    console.log('✓ Meta Model API login complete');
    return;
  }

  if (args.command === 'logout') {
    logoutMeta();
    console.log('✓ Stored Meta Model API credential removed');
    return;
  }

  if (args.command === 'auth-status') {
    const status = authStatus();
    console.log(status.authenticated ? `Authenticated via ${status.source}` : 'Not authenticated');
    console.log(`Credential backend: ${status.backend}`);
    if (status.detail) console.log(status.detail);
    return;
  }

  if (args.platform) process.env.MUSE_PLATFORM = args.platform;

  const credential = await ensureMetaCredential();
  setRuntimeApiKey(credential.apiKey);
  if (credential.source !== 'environment') console.log(`Authenticated via ${credential.source}`);

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
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
