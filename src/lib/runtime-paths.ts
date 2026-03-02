import path from 'path';

export function isStandaloneCwd(cwd = process.cwd()): boolean {
  const n = path.normalize(cwd);
  return path.basename(n) === 'standalone' && path.basename(path.dirname(n)) === '.next';
}

export function getProjectRoot(): string {
  const cwd = process.cwd();
  if (isStandaloneCwd(cwd)) {
    return path.resolve(cwd, '..', '..');
  }
  return cwd;
}

