export const config = {
  apiKey: process.env.LLAMA_API_KEY || '',
  model: process.env.LLAMA_MODEL || 'Llama-Spark-1.2',
  workdir: process.env.WORKDIR || './workdir',
  apiBase: process.env.LLAMA_API_BASE || 'https://api.llama.com/v1',
  maxSteps: 100,
  commandTimeoutMs: 120_000,
}
