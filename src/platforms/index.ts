import os from 'node:os';
import { wslPlatform } from './wsl.js';
import { iosPlatform, linuxPlatform, macosPlatform, windowsPlatform } from './native.js';
import type { PlatformAdapter, PlatformId } from './types.js';

const platforms: Record<PlatformId, PlatformAdapter> = {
  wsl: wslPlatform,
  linux: linuxPlatform,
  macos: macosPlatform,
  windows: windowsPlatform,
  ios: iosPlatform,
};

export function detectPlatform(requested = process.env.MUSE_PLATFORM || 'auto'): PlatformAdapter {
  if (requested !== 'auto') {
    const platform = platforms[requested as PlatformId];
    if (!platform) {
      throw new Error(`Unknown MUSE_PLATFORM=${requested}. Expected auto, ${Object.keys(platforms).join(', ')}`);
    }
    return platform;
  }

  switch (os.platform()) {
    case 'win32': return wslPlatform;
    case 'darwin': return macosPlatform;
    case 'linux': return linuxPlatform;
    default: throw new Error(`Unsupported host platform: ${os.platform()}`);
  }
}

export type { PlatformAdapter, PlatformId } from './types.js';
