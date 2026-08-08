export const config = {
  apiKey: process.env.MUSE_API_KEY || process.env.LLAMA_API_KEY || '',
  model: process.env.MUSE_MODEL || process.env.LLAMA_MODEL || 'muse-spark-1.2',
  workdir: process.env.WORKDIR || './workdir',
  apiBase: (process.env.MUSE_API_BASE || process.env.LLAMA_API_BASE || 'https://api.meta.ai/v1').replace(/\/$/, ''),
  maxSteps: Number(process.env.MUSE_MAX_STEPS || 100),
  commandTimeoutMs: Number(process.env.MUSE_COMMAND_TIMEOUT_MS || 120_000),
};
