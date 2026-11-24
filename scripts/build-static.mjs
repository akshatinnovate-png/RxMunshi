// Static build for the Windows and Android apps: Next.js cannot export server
// route handlers, so src/app/api is moved aside for the build and always put back.
import { execSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';

const api = 'src/app/api';
const parked = 'src/.api-parked';
if (existsSync(parked) && !existsSync(api)) renameSync(parked, api); // recover from an interrupted run
renameSync(api, parked);
try {
  execSync('next build', { stdio: 'inherit', env: { ...process.env, STATIC_EXPORT: '1', NEXT_TELEMETRY_DISABLED: '1' } });
} finally {
  renameSync(parked, api);
}
