import fs from 'node:fs';
import path from 'node:path';
import { parseModelSelection, type ModelSelection } from '../models.js';

export type WorkspaceMode = 'shared' | 'worktree';
export type ReceiveMode = 'task' | 'batch';

export type SwarmRole = {
  id: string;
  model: ModelSelection;
  prompt: string;
  dependsOn: string[];
  workspace: WorkspaceMode;
  receive: ReceiveMode;
};

export type SwarmConfig = {
  version: 1;
  roles: SwarmRole[];
};

type RawRole = {
  id?: unknown;
  model?: unknown;
  prompt?: unknown;
  dependsOn?: unknown;
  workspace?: unknown;
  receive?: unknown;
};

export function loadSwarmConfig(file: string): SwarmConfig {
  const absolute = path.resolve(file);
  let raw: any;
  try { raw = JSON.parse(fs.readFileSync(absolute, 'utf8')); }
  catch (error: any) { throw new Error(`Cannot read swarm config ${absolute}: ${error.message}`); }
  if (raw?.version !== 1 || !Array.isArray(raw.roles) || raw.roles.length === 0) {
    throw new Error('Swarm config requires version 1 and a non-empty roles array');
  }

  const ids = new Set<string>();
  const roles = raw.roles.map((item: RawRole, index: number): SwarmRole => {
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(id)) throw new Error(`roles[${index}].id must be a lowercase role name`);
    if (ids.has(id)) throw new Error(`Duplicate swarm role: ${id}`);
    ids.add(id);
    if (typeof item.model !== 'string' || !item.model.includes('/')) {
      throw new Error(`Role ${id} requires model in provider/model form`);
    }
    if (typeof item.prompt !== 'string' || !item.prompt.trim()) throw new Error(`Role ${id} requires a prompt`);
    const dependsOn = item.dependsOn === undefined ? [] : item.dependsOn;
    if (!Array.isArray(dependsOn) || dependsOn.some((value) => typeof value !== 'string')) {
      throw new Error(`Role ${id}.dependsOn must be an array of role names`);
    }
    const workspace = item.workspace ?? 'worktree';
    if (workspace !== 'shared' && workspace !== 'worktree') throw new Error(`Role ${id} has invalid workspace mode`);
    const receive = item.receive ?? 'task';
    if (receive !== 'task' && receive !== 'batch') throw new Error(`Role ${id} has invalid receive mode`);
    return { id, model: parseModelSelection(item.model), prompt: item.prompt.trim(), dependsOn, workspace, receive };
  });

  for (const role of roles) {
    for (const dependency of role.dependsOn) {
      if (!ids.has(dependency)) throw new Error(`Role ${role.id} depends on unknown role ${dependency}`);
      if (dependency === role.id) throw new Error(`Role ${role.id} cannot depend on itself`);
    }
  }
  assertAcyclic(roles);
  return { version: 1, roles };
}

function assertAcyclic(roles: SwarmRole[]) {
  const byId = new Map(roles.map((role) => [role.id, role]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`Swarm role dependency cycle includes ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)!.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const role of roles) visit(role.id);
}
