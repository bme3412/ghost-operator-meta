'use server';

import { spawn } from 'node:child_process';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { repoRoot, setOpportunityState, type OpportunityState } from '@atlas/data';

const STATES: OpportunityState[] = ['detected', 'proposed', 'approved', 'running', 'done', 'rejected'];

/** Launch the worker's supervised demo run in the background, then open it. */
export async function startRunAction(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const root = repoRoot();
  if (!id || !root) throw new Error('Cannot start run without opportunity and repo root.');
  const runId = `run-${Date.now()}`;
  const worker = path.join(root, 'apps', 'worker', 'dist', 'index.js');
  const child = spawn(process.execPath, [worker, '--run', id, '--run-id', runId], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
  revalidatePath('/atlas/inbox');
  revalidatePath('/runs');
  redirect(`/runs/${runId}`);
}

export async function opportunityAction(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const state = String(form.get('state') ?? '');
  if (id && (STATES as string[]).includes(state)) {
    setOpportunityState(id, state as OpportunityState);
  }
  revalidatePath('/atlas/inbox');
  revalidatePath('/');
}
