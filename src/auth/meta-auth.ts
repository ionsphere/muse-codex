import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { credentialStoreStatus, deleteStoredCredential, readStoredCredential, writeStoredCredential } from './credential-store.js';

export const META_MODEL_API_PORTAL = 'https://developer.meta.com/ai/';

export type AuthSource = 'environment' | 'secure-store' | 'interactive';

export function environmentCredential(): string | undefined {
  return process.env.META_MODEL_API_KEY || undefined;
}

export function resolveCredential(): { apiKey?: string; source?: AuthSource } {
  const env = environmentCredential();
  if (env) return { apiKey: env, source: 'environment' };
  const stored = readStoredCredential();
  if (stored) return { apiKey: stored, source: 'secure-store' };
  return {};
}

function openBrowser(url: string): void {
  const platform = process.platform;
  if (platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return;
  }
  if (platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

async function promptSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Interactive login requires a terminal. Run `zeal login` in a terminal or set META_MODEL_API_KEY.');
  }

  process.stdout.write(prompt);
  const stdin = process.stdin;
  stdin.setRawMode?.(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  return await new Promise<string>((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      stdin.setRawMode?.(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\u0003') {
          cleanup();
          process.stdout.write('\n');
          reject(new Error('Login cancelled.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value.trim());
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };
    stdin.on('data', onData);
  });
}

export async function loginMeta(): Promise<string> {
  const store = credentialStoreStatus();
  if (!store.available) throw new Error(store.detail || 'Secure credential storage is unavailable.');

  console.log('Opening Meta Model API…');
  console.log(`If the browser does not open, visit: ${META_MODEL_API_PORTAL}`);
  openBrowser(META_MODEL_API_PORTAL);
  console.log('Sign in to Meta, create a Model API key, then paste it below.');
  const apiKey = await promptSecret('API key: ');
  if (!apiKey) throw new Error('No API key entered.');
  writeStoredCredential(apiKey);
  console.log(`✓ Credential saved using ${store.backend}`);
  return apiKey;
}

export async function ensureMetaCredential(): Promise<{ apiKey: string; source: AuthSource }> {
  const resolved = resolveCredential();
  if (resolved.apiKey && resolved.source) return { apiKey: resolved.apiKey, source: resolved.source };
  console.log('No Meta Model API credential found. Starting login…');
  const apiKey = await loginMeta();
  return { apiKey, source: 'interactive' };
}

export function logoutMeta(): void {
  deleteStoredCredential();
}

export function authStatus(): { authenticated: boolean; source?: AuthSource; backend: string; detail?: string } {
  const resolved = resolveCredential();
  const store = credentialStoreStatus();
  return {
    authenticated: Boolean(resolved.apiKey),
    source: resolved.source,
    backend: store.backend,
    detail: store.detail,
  };
}

export async function waitForEnter(message: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => rl.question(message, () => resolve()));
  rl.close();
}
