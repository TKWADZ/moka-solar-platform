import { randomBytes } from 'crypto';

export function toNumber(value?: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  return Number(value);
}

export function sumBy<T>(items: T[], mapper: (item: T) => number): number {
  return items.reduce((total, item) => total + mapper(item), 0);
}

export function generateCode(prefix: string, seed = new Date()): string {
  const stamp = [
    seed.getFullYear(),
    String(seed.getMonth() + 1).padStart(2, '0'),
    String(seed.getDate()).padStart(2, '0'),
    String(seed.getHours()).padStart(2, '0'),
    String(seed.getMinutes()).padStart(2, '0'),
  ].join('');

  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${stamp}-${random}`;
}

export function getMonthDateRange(year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  return { from, to };
}

export function sortByDateAsc<T>(items: T[], mapper: (item: T) => Date): T[] {
  return [...items].sort(
    (left, right) => mapper(left).getTime() - mapper(right).getTime(),
  );
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function createTemporaryPassword() {
  return `Moka#${randomBytes(4).toString('hex')}A1`;
}
