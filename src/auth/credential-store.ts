import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SERVICE = 'zeal-meta-model-api';
const ACCOUNT = os.userInfo().username || 'default';

export type CredentialStoreStatus = {
  backend: 'windows-dpapi' | 'macos-keychain' | 'linux-secret-service' | 'unavailable';
  available: boolean;
  detail?: string;
};

function run(command: string, args: string[], options: { input?: string; env?: NodeJS.ProcessEnv } = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    input: options.input,
    env: options.env || process.env,
    windowsHide: true,
  });
}

function commandExists(command: string): boolean {
  const probe = process.platform === 'win32'
    ? run('where.exe', [command])
    : run('/bin/sh', ['-lc', `command -v ${command}`]);
  return probe.status === 0;
}

function windowsCredentialFile(): string {
  const root = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(root, 'zeal', 'meta-model-api.dpapi');
}

export function credentialStoreStatus(): CredentialStoreStatus {
  if (process.platform === 'win32') {
    return { backend: 'windows-dpapi', available: commandExists('powershell.exe') };
  }
  if (process.platform === 'darwin') {
    return { backend: 'macos-keychain', available: commandExists('security') };
  }
  if (process.platform === 'linux') {
    const available = commandExists('secret-tool');
    return {
      backend: available ? 'linux-secret-service' : 'unavailable',
      available,
      detail: available ? undefined : 'Install libsecret/secret-tool or use META_MODEL_API_KEY.',
    };
  }
  return { backend: 'unavailable', available: false, detail: `Unsupported platform: ${process.platform}` };
}

export function readStoredCredential(): string | undefined {
  const status = credentialStoreStatus();
  if (!status.available) return undefined;

  if (status.backend === 'windows-dpapi') {
    const file = windowsCredentialFile();
    if (!fs.existsSync(file)) return undefined;
    const script = [
      '$bytes=[IO.File]::ReadAllBytes($env:ZEAL_CREDENTIAL_FILE)',
      '$plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)',
      '[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))',
    ].join(';');
    const result = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...process.env, ZEAL_CREDENTIAL_FILE: file },
    });
    return result.status === 0 ? result.stdout.trim() || undefined : undefined;
  }

  if (status.backend === 'macos-keychain') {
    const result = run('security', ['find-generic-password', '-a', ACCOUNT, '-s', SERVICE, '-w']);
    return result.status === 0 ? result.stdout.trim() || undefined : undefined;
  }

  const result = run('secret-tool', ['lookup', 'service', SERVICE, 'account', ACCOUNT]);
  return result.status === 0 ? result.stdout.trim() || undefined : undefined;
}

export function writeStoredCredential(secret: string): void {
  const status = credentialStoreStatus();
  if (!status.available) throw new Error(status.detail || 'Secure credential storage is unavailable.');

  if (status.backend === 'windows-dpapi') {
    const file = windowsCredentialFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const script = [
      '$plain=[Text.Encoding]::UTF8.GetBytes($env:ZEAL_SECRET)',
      '$bytes=[Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)',
      '[IO.File]::WriteAllBytes($env:ZEAL_CREDENTIAL_FILE,$bytes)',
    ].join(';');
    const result = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...process.env, ZEAL_SECRET: secret, ZEAL_CREDENTIAL_FILE: file },
    });
    if (result.status !== 0) throw new Error(result.stderr.trim() || 'Failed to store credential with Windows DPAPI.');
    return;
  }

  if (status.backend === 'macos-keychain') {
    const result = run('/bin/sh', ['-lc', 'security add-generic-password -U -a "$ZEAL_ACCOUNT" -s "$ZEAL_SERVICE" -w "$ZEAL_SECRET"'], {
      env: { ...process.env, ZEAL_ACCOUNT: ACCOUNT, ZEAL_SERVICE: SERVICE, ZEAL_SECRET: secret },
    });
    if (result.status !== 0) throw new Error(result.stderr.trim() || 'Failed to store credential in macOS Keychain.');
    return;
  }

  const result = run('secret-tool', ['store', '--label=Zeal Meta Model API', 'service', SERVICE, 'account', ACCOUNT], { input: secret });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'Failed to store credential in Secret Service.');
}

export function deleteStoredCredential(): void {
  const status = credentialStoreStatus();
  if (!status.available) return;

  if (status.backend === 'windows-dpapi') {
    const file = windowsCredentialFile();
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return;
  }

  if (status.backend === 'macos-keychain') {
    run('security', ['delete-generic-password', '-a', ACCOUNT, '-s', SERVICE]);
    return;
  }

  run('secret-tool', ['clear', 'service', SERVICE, 'account', ACCOUNT]);
}
