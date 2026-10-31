import Link from 'next/link';
import { listFunctions, listOpportunities, listRuns, listTasks } from '@atlas/data';

export const dynamic = 'force-dynamic';

const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:3101';

const LOOP = [
  ['Detect', 'Atlas watches connected business apps for automation opportunities.'],
  ['Propose', 'Each finding becomes a proposal with evidence and expected impact.'],
  ['Approve', 'A human reviews and approves or rejects every proposal.'],
  ['Execute', 'The execution service carries out approved work in the real app UI.'],
  ['Report', 'Steps, screenshots, and outcome are recorded for inspection.'],
];

const ROUTES: Array<[string, string, string]> = [
  ['/atlas/inbox', 'Opportunity inbox', 'Detected automations awaiting supervision.'],
  ['/atlas', 'Atlas', 'Company overview: functions, tasks, evidence.'],
  ['/workflows', 'Workflows', 'Process detail: inputs, outputs, rules, skills.'],
  ['/recordings', 'Recordings', 'Teach a procedure by demonstration.'],
  ['/skills', 'Skills', 'Review, edit, and run skill versions.'],
  ['/runs', 'Runs', 'Inspect execution events and checks.'],
];

interface FlowInfo {
  app: string;
  flow: string;
  description: string;
}

async function workerFlows(): Promise<{ online: boolean; flows: FlowInfo[] }> {
  try {
    const res = await fetch(`${WORKER_URL}/flows`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { online: true, flows: [] };
    return { online: true, flows: (await res.json()) as FlowInfo[] };
  } catch {
    return { online: false, flows: [] };
  }
}

export default async function Home() {
  const functions = listFunctions();
  const tasks = listTasks();
  const opportunities = listOpportunities();
  const runs = listRuns(5);
  const review = opportunities.filter((o) => o.state === 'detected' || o.state === 'proposed');
  const active = opportunities.filter((o) => o.state === 'approved' || o.state === 'running').length;
  const succeeded = runs.filter((r) => r.status === 'succeeded').length;
  const worker = await workerFlows();
  const apps = [...new Set(worker.flows.map((f) => f.app))];

  const stats: Array<[string, string]> = [
    [String(review.length), 'awaiting review'],
    [String(active), 'approved or running'],
    [String(succeeded), 'recent runs succeeded'],
    [worker.online ? String(apps.length) : '—', 'apps connected'],
  ];

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Workflow Atlas</h1>
      <p className="mt-2 max-w-2xl text-base text-neutral-700">
        Human-supervised automation for small businesses. Atlas finds opportunities in your apps,
        proposes them with evidence, and only acts after you approve. It currently maps{' '}
        {functions.length} functions and {tasks.length} tasks.
      </p>
      <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4 border-y border-neutral-200 py-4">
        {stats.map(([value, label]) => (
          <div key={label}>
            <dd className="text-3xl font-semibold tabular-nums">{value}</dd>
            <dt className="mt-1 text-sm text-neutral-600">{label}</dt>
          </div>
        ))}
      </dl>

      <ol className="mt-6 grid gap-4 sm:grid-cols-5">
        {LOOP.map(([step, desc], i) => (
          <li key={step} className="border-t-2 border-teal-800 pt-2">
            <p className="text-sm font-semibold">
              <span className="mr-1 tabular-nums text-teal-800">{i + 1}.</span> {step}
            </p>
            <p className="mt-1 text-sm text-neutral-600">{desc}</p>
          </li>
        ))}
      </ol>

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Needs your review</h2>
          <Link href="/atlas/inbox" className="text-sm text-teal-800 hover:underline">
            Open inbox →
          </Link>
        </div>
        {review.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">Nothing waiting — every opportunity has a decision.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">
            {review.map((o) => (
              <li key={o.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
                <Link href={`/atlas/opportunities/${o.id}`} className="text-sm font-medium text-teal-800 hover:underline">
                  {o.title}
                </Link>
                <span className="text-xs text-neutral-500">
                  {o.kind} · {o.state}
                </span>
                <span className="basis-full text-sm text-neutral-600">{o.impact}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Execution service</h2>
        {worker.online ? (
          <div className="mt-2">
            <p className="text-sm text-neutral-600">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-teal-700" aria-hidden />
              Worker online at {WORKER_URL} — {worker.flows.length} supervised{' '}
              {worker.flows.length === 1 ? 'flow' : 'flows'} registered.
            </p>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                  <th className="py-2 pr-4 font-medium">App</th>
                  <th className="py-2 pr-4 font-medium">Flow</th>
                  <th className="py-2 font-medium">What it does</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {worker.flows.map((f) => (
                  <tr key={`${f.app}/${f.flow}`}>
                    <td className="py-2 pr-4 font-medium">{f.app}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{f.flow}</td>
                    <td className="py-2 text-neutral-600">{f.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 max-w-2xl text-sm text-neutral-600">
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-neutral-300" aria-hidden />
            Worker offline — the execution service is a separate process. Start it with{' '}
            <code className="bg-neutral-100 px-1 text-xs">pnpm worker</code> to enable supervised runs.
          </p>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Recent runs</h2>
          <Link href="/runs" className="text-sm text-teal-800 hover:underline">
            All runs →
          </Link>
        </div>
        {runs.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">No supervised runs yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-4 py-2 text-sm">
                <Link href={`/runs/${r.id}`} className="font-mono text-xs text-teal-800 hover:underline">
                  {r.id}
                </Link>
                <span className="text-neutral-600">{r.skillId}</span>
                <span className="text-xs text-neutral-500">{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Explore</h2>
        <ul className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">
          {ROUTES.map(([href, label, desc]) => (
            <li key={href} className="flex items-baseline gap-4 py-3">
              <Link href={href} className="w-36 shrink-0 text-sm font-medium text-teal-800 hover:underline">
                {label}
              </Link>
              <span className="text-sm text-neutral-600">{desc}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-neutral-600">
          Saltbreak Surf Co. runs separately — storefront and staff tools on port 3000 — as one demo target.
        </p>
      </section>
    </div>
  );
}
