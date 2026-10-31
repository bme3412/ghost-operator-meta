// The execution service is app-agnostic: opportunities resolve through the
// registry to a registered app driver, and Saltbreak is just one entry.
// Run with: pnpm test (from this package; builds dist/ first via pretest).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { APPS, FLOWS_BY_KIND, listFlows } = require('../dist/apps/registry.js');

describe('app registry', () => {
  it('registers the saltbreak demo app with a fulfill-backlog flow', () => {
    assert.ok(APPS.saltbreak, 'missing saltbreak app');
    assert.equal(typeof APPS.saltbreak.baseUrl, 'function');
    assert.equal(typeof APPS.saltbreak.flows['fulfill-backlog'].run, 'function');
  });

  it('routes the fulfillment opportunity kind to the saltbreak flow', () => {
    assert.deepEqual(FLOWS_BY_KIND.fulfillment, { app: 'saltbreak', flow: 'fulfill-backlog' });
  });

  it('resolves every routed kind to a real app and flow', () => {
    for (const [kind, target] of Object.entries(FLOWS_BY_KIND)) {
      const app = APPS[target.app];
      assert.ok(app, `kind '${kind}' points at unknown app '${target.app}'`);
      assert.ok(app.flows[target.flow], `kind '${kind}' points at unknown flow '${target.flow}'`);
    }
  });

  it('lists registered flows for operators', () => {
    const flows = listFlows();
    assert.ok(
      flows.some((f) => f.app === 'saltbreak' && f.flow === 'fulfill-backlog'),
      'saltbreak fulfill-backlog missing from listFlows()',
    );
  });
});
