import { listSources } from '@saltbreak/data';
import { Shell } from '../../shell';

export const dynamic = 'force-dynamic';

function preview(data: string): string {
  try {
    const parsed: unknown = JSON.parse(data);
    return JSON.stringify(parsed, null, 1).slice(0, 500);
  } catch {
    return data.slice(0, 500);
  }
}

export default function SupplierPage() {
  const sources = listSources();
  return (
    <Shell
      title="Supplier intake"
      blurb="Synthetic Saltbreak supplier packages: product facts, specifications, and manifests with approved-image references."
    >
      {sources.length === 0 ? (
        <p className="text-sm text-neutral-600">
          No sources yet. Run <code className="bg-neutral-100 px-1">pnpm db:seed</code> from the repo root.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
          {sources.map((s) => (
            <li key={`${s.id}@${s.version}`} className="py-3">
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-medium">{s.id}</span>
                <span className="text-xs text-neutral-500">
                  {s.kind} · v{s.version}
                </span>
              </div>
              <pre className="mt-1 overflow-x-auto bg-neutral-50 p-2 text-xs text-neutral-700">
                {preview(s.data)}
              </pre>
              {s.fileRef ? <p className="mt-1 text-xs text-neutral-500">ref: {s.fileRef}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
