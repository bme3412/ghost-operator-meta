import type { Page } from 'playwright';
import { saltbreakApp } from './saltbreak';

/**
 * App registry. The execution service (runner/) is app-agnostic: to support
 * a new application, add an AppDef here and map the opportunity kinds it can
 * serve. Saltbreak is one entry, kept only as the demo target.
 */
export interface AppContext {
  page: Page;
  baseUrl: string;
  shot(name: string): Promise<void>;
  record(stepId: string, actions: string[], outcome: string, passed: boolean): void;
}

export type FlowFn = (ctx: AppContext) => Promise<void>;

export interface AppDef {
  id: string;
  description: string;
  baseUrl(): string;
  flows: Record<string, { description: string; run: FlowFn }>;
}

export const APPS: Record<string, AppDef> = {
  saltbreak: saltbreakApp,
};

/** Opportunity kind → the app flow that serves it. */
export const FLOWS_BY_KIND: Record<string, { app: string; flow: string }> = {
  fulfillment: { app: 'saltbreak', flow: 'fulfill-backlog' },
};

export function listFlows(): Array<{ app: string; flow: string; description: string }> {
  const out: Array<{ app: string; flow: string; description: string }> = [];
  for (const app of Object.values(APPS)) {
    for (const [flow, def] of Object.entries(app.flows)) {
      out.push({ app: app.id, flow, description: def.description });
    }
  }
  return out;
}
