import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'pgsql-parser';

const directory = new URL('../supabase/migrations/', import.meta.url);
const names = readdirSync(directory).filter(name => name.endsWith('.sql')).sort();

describe('Migration SQL syntax and setup consistency (no live database)', () => {
  it.each(names)('parses %s using the PostgreSQL parser', async name => {
    await expect(parse(readFileSync(new URL(name, directory), 'utf8'))).resolves.toBeTruthy();
  });
  it('includes every migration exactly once and in order', async () => {
    const sql = readFileSync(new URL('../supabase/setup.sql', import.meta.url), 'utf8');
    let previous = -1;
    for (const name of names) {
      const section = `-- Migration: ${name}\n${readFileSync(new URL(name, directory), 'utf8')}`;
      const index = sql.indexOf(section);
      expect(index).toBeGreaterThan(previous);
      expect(sql.indexOf(`-- Migration: ${name}`, index + 1)).toBe(-1);
      previous = index;
    }
    await expect(parse(sql)).resolves.toBeTruthy();
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
