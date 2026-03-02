import { cp, mkdir, stat } from 'fs/promises';
import path from 'path';

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true, force: true });
}

const root = process.cwd();
const nextStatic = path.join(root, '.next', 'static');
const standaloneRoot = path.join(root, '.next', 'standalone');

if (!(await exists(standaloneRoot))) {
  console.warn('[postbuild] Standalone output not found, skipping copy.');
  process.exit(0);
}

// Next standalone не всегда включает статические ассеты/паблик.
if (await exists(nextStatic)) {
  await copyDir(nextStatic, path.join(standaloneRoot, '.next', 'static'));
  console.log('[postbuild] Copied .next/static');
}

const publicDir = path.join(root, 'public');
if (await exists(publicDir)) {
  await copyDir(publicDir, path.join(standaloneRoot, 'public'));
  console.log('[postbuild] Copied public/');
}

// Копируем БД для standalone (DATABASE_URL=file:./db/custom.db)
const dbDir = path.join(root, 'db');
if (await exists(dbDir)) {
  await mkdir(path.join(standaloneRoot, 'db'), { recursive: true });
  const dbFile = path.join(dbDir, 'custom.db');
  if (await exists(dbFile)) {
    await cp(dbFile, path.join(standaloneRoot, 'db', 'custom.db'), { force: true });
    console.log('[postbuild] Copied db/custom.db');
  }
}

