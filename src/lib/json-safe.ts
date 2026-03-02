export function jsonSafe<T>(value: T): T {
  return convert(value) as T;
}

function convert(value: any): any {
  if (value === null || value === undefined) return value;

  const t = typeof value;
  if (t === 'bigint') return value.toString();
  if (t !== 'object') return value;

  if (Array.isArray(value)) return value.map(convert);

  // Не трогаем не-plain объекты (Date, Error, и т.п.) — JSON.stringify сам вызовет toJSON где нужно.
  const proto = Object.getPrototypeOf(value);
  if (proto && proto !== Object.prototype) return value;

  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = convert(v);
  }
  return out;
}

