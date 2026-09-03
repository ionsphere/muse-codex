import { runCommandTool, type ExecResult } from '../tools/exec.js';
import type { QualityGate } from './config.js';

export type GateResult = QualityGate & ExecResult & { passed: boolean };

export async function runQualityGates(gates: QualityGate[], workdir: string): Promise<GateResult[]> {
  const results: GateResult[] = [];
  for (const gate of gates) {
    const result = await runCommandTool(gate.command, workdir, gate.timeoutMs);
    results.push({ ...gate, ...result, passed: result.code === 0 && !result.timedOut });
    if (result.code !== 0 || result.timedOut) break;
  }
  return results;
}

export function gateFailurePrompt(results: GateResult[]) {
  const failed = results.find((result) => !result.passed);
  if (!failed) return '';
  return `Quality gate "${failed.name}" failed${failed.timedOut ? ' by timeout' : ` with exit code ${failed.code}`}.
Command: ${failed.command}
stdout:\n${failed.stdout.slice(-8_000)}
stderr:\n${failed.stderr.slice(-8_000)}
Fix the failure, rerun relevant checks, and commit the corrected state.`;
}
