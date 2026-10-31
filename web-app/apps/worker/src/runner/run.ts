import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  addStep,
  createRun,
  getOpportunity,
  repoRoot,
  setOpportunityState,
  setRunStatus,
} from '@atlas/data';
import { APPS, FLOWS_BY_KIND, type AppContext } from '../apps/registry';

/**
 * App-agnostic supervised execution. Resolves the opportunity's kind to a
 * registered app flow, runs it in a browser, and records steps, screenshots,
 * and outcome as Atlas evidence. The runner knows nothing about Saltbreak;
 * all app specifics live in the registered driver.
 */
export async function executeRun(opportunityId: string, runId: string): Promise<void> {
  const opp = getOpportunity(opportunityId);
  if (!opp) throw new Error(`No opportunity ${opportunityId}.`);
  const target = FLOWS_BY_KIND[opp.kind];
  if (!target) throw new Error(`No driver registered for opportunity kind '${opp.kind}'.`);
  const app = APPS[target.app];
  const flow = app?.flows[target.flow];
  if (!app || !flow) throw new Error(`Driver missing for app '${target.app}', flow '${target.flow}'.`);

  const root = repoRoot();
  if (!root) throw new Error('Cannot locate repository root');
  const dir = path.join(root, 'data', 'atlas-runs', runId);
  fs.mkdirSync(dir, { recursive: true });

  createRun(runId, `${app.id}-${target.flow}`, 1, `supervised-${Date.now()}`);
  const claimed = setOpportunityState(opportunityId, 'running');
  if (!claimed.ok) throw new Error(claimed.message);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const ctx: AppContext = {
      page,
      baseUrl: app.baseUrl(),
      shot: async (name: string) => {
        await page.screenshot({ path: path.join(dir, name) });
      },
      record: (stepId: string, actions: string[], outcome: string, passed: boolean) => {
        addStep(runId, stepId, actions, outcome, passed);
      },
    };
    await flow.run(ctx);
    setRunStatus(runId, 'succeeded');
    setOpportunityState(opportunityId, 'done');
    console.log(`run ${runId} succeeded for ${opportunityId}.`);
  } catch (err) {
    addStep(runId, 'failed', [], err instanceof Error ? err.message : String(err), false);
    setRunStatus(runId, 'failed');
    setOpportunityState(opportunityId, 'approved');
    throw err;
  } finally {
    await browser.close();
  }
}
