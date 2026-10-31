import { listFunctions, listTasks } from '@atlas/data';
import { Shell } from '../shell';

export const dynamic = 'force-dynamic';

export default function AtlasPage() {
  const functions = listFunctions();
  const tasks = listTasks();
  return (
    <Shell
      title="Atlas"
      blurb="Company overview for Saltbreak Surf Co. The interactive graph arrives in a later slice; the underlying records are live below."
    >
      {functions.map((f) => (
        <div key={f.id} className="mb-6">
          <h2 className="text-base font-semibold">{f.name}</h2>
          <p className="text-sm text-neutral-600">{f.responsibilities}</p>
          <ul className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">
            {tasks
              .filter((t) => t.functionId === f.id)
              .map((t) => (
                <li key={t.id} className="flex items-baseline gap-4 py-2">
                  <span className="flex-1 text-sm">{t.purpose}</span>
                  <span className="text-xs text-neutral-500">{t.evidenceStatus}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </Shell>
  );
}
