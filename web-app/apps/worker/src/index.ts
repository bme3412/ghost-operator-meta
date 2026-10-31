import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { metaConfig } from './meta';

const PORT = Number(process.env.WORKER_PORT ?? 3101);

async function probe(moduleName: string): Promise<string> {
  try {
    await import(moduleName);
    return 'ok';
  } catch (err) {
    return `missing: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`.slice(0, 160);
  }
}

async function health(): Promise<Record<string, unknown>> {
  return {
    ok: true,
    node: process.version,
    uptimeSec: Math.round(process.uptime()),
    sharp: await probe('sharp'),
    playwright: await probe('playwright'),
    meta: metaConfig(),
  };
}

async function chromium(): Promise<Record<string, unknown>> {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const version = browser.version();
    await browser.close();
    return { ok: true, version };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 300) };
  }
}

function send(res: ServerResponse, body: unknown): void {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body, null, 2));
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health') {
    health().then((b) => send(res, b)).catch((err: unknown) => send(res, { ok: false, error: String(err) }));
  } else if (req.url === '/chromium') {
    chromium().then((b) => send(res, b)).catch((err: unknown) => send(res, { ok: false, error: String(err) }));
  } else if (req.url === '/flows') {
    import('./apps/registry')
      .then((m) => send(res, m.listFlows()))
      .catch((err: unknown) => send(res, { ok: false, error: String(err) }));
  } else {
    res.statusCode = 404;
    send(res, { ok: false, error: 'unknown route' });
  }
});

if (process.argv.includes('--probe')) {
  Promise.all([health(), chromium()]).then(([h, c]) => {
    console.log(JSON.stringify({ health: h, chromium: c }, null, 2));
    process.exit(0);
  });
} else if (process.argv.includes('--list-flows')) {
  void (async () => {
    const { listFlows } = await import('./apps/registry');
    console.log(JSON.stringify(listFlows(), null, 2));
    process.exit(0);
  })();
} else if (process.argv.includes('--run')) {
  void (async () => {
    const { executeRun } = await import('./runner/run');
    const args = process.argv.slice(process.argv.indexOf('--run') + 1);
    const oppId = args[0] && !args[0].startsWith('--') ? args[0] : 'opp-fulfill-backlog';
    const runFlag = args.indexOf('--run-id');
    const runId = runFlag >= 0 && args[runFlag + 1] ? args[runFlag + 1] : `run-${Date.now()}`;
    console.log(`starting supervised run ${runId} for ${oppId}`);
    try {
      await executeRun(oppId, runId);
      process.exit(0);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  })();
} else {
  server.listen(PORT, () => {
    console.log(`worker listening on http://localhost:${PORT}`);
  });
}
