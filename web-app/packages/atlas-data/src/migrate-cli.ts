import { closeDb, getDb, migrate } from './db';
import { seed } from './seed';

const cmd = process.argv[2];

if (cmd === 'up') {
  migrate();
  console.log('atlas schema applied');
} else if (cmd === 'seed') {
  migrate();
  console.log('atlas seeded:', JSON.stringify(seed()));
} else if (cmd === 'reset') {
  migrate();
  getDb().exec('DELETE FROM opportunities; DELETE FROM evidence; DELETE FROM artifacts; DELETE FROM step_attempts; DELETE FROM runs; DELETE FROM skill_versions; DELETE FROM skills; DELETE FROM recording_events; DELETE FROM recordings; DELETE FROM edges; DELETE FROM tasks; DELETE FROM functions;');
  console.log('atlas store reset:', JSON.stringify(seed()));
} else {
  console.error('usage: migrate-cli <up|seed|reset>');
  process.exitCode = 1;
}

closeDb();
