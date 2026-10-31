import type { SQLOutputValue } from 'node:sqlite';
import { getDb } from './db';

type Row = Record<string, SQLOutputValue>;

function str(v: SQLOutputValue | undefined): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : String(v);
}

export interface CompanyFunction {
  id: string;
  name: string;
  responsibilities: string;
}

export interface GraphTask {
  id: string;
  functionId: string;
  purpose: string;
  evidenceStatus: string;
}

export function listFunctions(): CompanyFunction[] {
  const rows = getDb().prepare('SELECT * FROM functions ORDER BY name').all() as Row[];
  return rows.map((row) => ({ id: str(row.id), name: str(row.name), responsibilities: str(row.responsibilities) }));
}

export type OpportunityState = 'detected' | 'proposed' | 'approved' | 'running' | 'done' | 'rejected';

export interface Opportunity {
  id: string;
  title: string;
  kind: string;
  state: OpportunityState;
  hypothesis: string;
  impact: string;
  evidence: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const OPP_TRANSITIONS: Record<string, OpportunityState[]> = {
  detected: ['proposed', 'rejected'],
  proposed: ['approved', 'rejected'],
  approved: ['running', 'rejected'],
  running: ['done', 'approved'],
  done: [],
  rejected: ['proposed'],
};

function toOpportunity(row: Row): Opportunity {
  let evidence: Record<string, unknown> = {};
  try {
    evidence = JSON.parse(str(row.evidence) || '{}') as Record<string, unknown>;
  } catch {
    evidence = {};
  }
  return {
    id: str(row.id),
    title: str(row.title),
    kind: str(row.kind),
    state: str(row.state) as OpportunityState,
    hypothesis: str(row.hypothesis),
    impact: str(row.impact),
    evidence,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function listOpportunities(): Opportunity[] {
  const rows = getDb().prepare('SELECT * FROM opportunities ORDER BY created_at').all() as Row[];
  return rows.map(toOpportunity);
}

export function getOpportunity(id: string): Opportunity | null {
  const row = getDb().prepare('SELECT * FROM opportunities WHERE id = ?').get(id) as Row | undefined;
  return row ? toOpportunity(row) : null;
}

export function setOpportunityState(id: string, state: OpportunityState): { ok: boolean; message: string } {
  const current = getOpportunity(id);
  if (!current) return { ok: false, message: `No opportunity ${id}.` };
  if (!OPP_TRANSITIONS[current.state]?.includes(state)) {
    return { ok: false, message: `Cannot move ${id} from ${current.state} to ${state}.` };
  }
  getDb().prepare('UPDATE opportunities SET state = ?, updated_at = ? WHERE id = ?').run(state, new Date().toISOString(), id);
  return { ok: true, message: `${id} is now ${state}.` };
}

export interface Run {
  id: string;
  skillId: string;
  skillVersion: number;
  status: string;
  createdAt: string;
}

export interface StepRecord {
  runId: string;
  stepId: string;
  attempt: number;
  actions: string[];
  observedOutcome: string;
  passed: boolean | null;
}

export function createRun(id: string, skillId: string, skillVersion: number, operationKey: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('INSERT OR IGNORE INTO skills (id, name, active_version) VALUES (?, ?, ?)').run(skillId, skillId, skillVersion);
  db.prepare(
    'INSERT INTO runs (id, skill_id, skill_version, pinned_inputs, operation_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, skillId, skillVersion, '[]', operationKey, 'running', now);
}

export function setRunStatus(id: string, status: string): void {
  getDb().prepare('UPDATE runs SET status = ? WHERE id = ?').run(status, id);
}

export function getRun(id: string): Run | null {
  const row = getDb().prepare('SELECT * FROM runs WHERE id = ?').get(id) as Row | undefined;
  if (!row) return null;
  return { id: str(row.id), skillId: str(row.skill_id), skillVersion: Number(row.skill_version ?? 0), status: str(row.status), createdAt: str(row.created_at) };
}

export function listRuns(limit = 20): Run[] {
  const rows = getDb().prepare('SELECT * FROM runs ORDER BY created_at DESC LIMIT ?').all(limit) as Row[];
  return rows.map((row) => ({ id: str(row.id), skillId: str(row.skill_id), skillVersion: Number(row.skill_version ?? 0), status: str(row.status), createdAt: str(row.created_at) }));
}

export function addStep(runId: string, stepId: string, actions: string[], observedOutcome: string, passed: boolean): void {
  getDb().prepare(
    'INSERT INTO step_attempts (run_id, step_id, attempt, actions, observed_outcome, passed) VALUES (?, ?, 0, ?, ?, ?)',
  ).run(runId, stepId, JSON.stringify(actions), observedOutcome, passed ? 1 : 0);
}

export function listSteps(runId: string): StepRecord[] {
  const rows = getDb().prepare('SELECT * FROM step_attempts WHERE run_id = ? ORDER BY rowid').all(runId) as Row[];
  return rows.map((row) => {
    let actions: string[] = [];
    try {
      actions = JSON.parse(str(row.actions) || '[]') as string[];
    } catch {
      actions = [];
    }
    return {
      runId: str(row.run_id),
      stepId: str(row.step_id),
      attempt: Number(row.attempt ?? 0),
      actions,
      observedOutcome: str(row.observed_outcome),
      passed: row.passed === null || row.passed === undefined ? null : Number(row.passed) === 1,
    };
  });
}

export function listTasks(functionId?: string): GraphTask[] {
  const rows = (
    functionId
      ? getDb().prepare('SELECT * FROM tasks WHERE function_id = ? ORDER BY id').all(functionId)
      : getDb().prepare('SELECT * FROM tasks ORDER BY id').all()
  ) as Row[];
  return rows.map((row) => ({
    id: str(row.id),
    functionId: str(row.function_id),
    purpose: str(row.purpose),
    evidenceStatus: str(row.evidence_status),
  }));
}
