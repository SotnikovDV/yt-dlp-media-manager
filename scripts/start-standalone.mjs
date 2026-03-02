#!/usr/bin/env node
// Запуск standalone-сервера с доступом по сети (0.0.0.0)
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';
process.env.PORT = process.env.PORT || '3000';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// Загружаем .env.local в process.env (для standalone важно — Next.js может не подхватить)
const envPath = path.join(root, '.env.local');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      process.env[key] = val;
    }
  }
}

const port = process.env.PORT || '3000';
const serverPath = path.join(root, '.next', 'standalone', 'server.js');

const child = spawn(process.execPath, [serverPath], {
  stdio: 'inherit',
  env: process.env,
  cwd: root,
});

// Через 3 с после старта вызываем GET /api/queue, чтобы гарантированно запустить воркер очереди
// (instrumentation в standalone может не вызываться)
setTimeout(() => {
  fetch(`http://127.0.0.1:${port}/api/queue`, { method: 'GET' }).catch(() => {});
}, 3000);

child.on('exit', (code) => process.exit(code ?? 0));
