import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@atlas/data';

const SAFE = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;
const SAFE_SHOT = /^[A-Za-z0-9-]+\.png$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; name: string }> },
): Promise<Response> {
  const { id, name } = await params;
  const root = repoRoot();
  if (!root || !SAFE.test(id) || !SAFE_SHOT.test(name)) {
    return new Response('Not found', { status: 404 });
  }
  const file = path.join(root, 'data', 'atlas-runs', id, name);
  if (!fs.existsSync(file)) return new Response('Not found', { status: 404 });
  const bytes = fs.readFileSync(file);
  return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/png' } });
}
