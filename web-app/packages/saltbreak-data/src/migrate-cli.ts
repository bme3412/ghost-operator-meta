import { closeDb, getDb, migrate } from './db';
import { seed } from './seed';

const cmd = process.argv[2];

if (cmd === 'up') {
  migrate();
  console.log('saltbreak schema applied');
} else if (cmd === 'seed') {
  migrate();
  console.log('saltbreak seeded:', JSON.stringify(seed()));
} else if (cmd === 'reset') {
  migrate();
  getDb().exec('DELETE FROM events; DELETE FROM emails; DELETE FROM customers; DELETE FROM promos; DELETE FROM stock_history; DELETE FROM ticket_replies; DELETE FROM order_items; DELETE FROM orders; DELETE FROM tickets; DELETE FROM inventory; DELETE FROM products; DELETE FROM drafts; DELETE FROM sources;');
  console.log('saltbreak sandbox reset:', JSON.stringify(seed()));
} else {
  console.error('usage: migrate-cli <up|seed|reset>');
  process.exitCode = 1;
}

closeDb();
