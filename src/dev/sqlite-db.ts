// A D1 database for `npm run dev` and the tests, over Node's own SQLite
// (node:sqlite): the same SQL as on Cloudflare, with nothing to install.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Db, Statement } from '../../raad/server/stats';

export function sqliteDb(file = ':memory:'): Db & { sql: DatabaseSync } {
  const sql = new DatabaseSync(file);
  const bound = new WeakMap<Statement, { text: string; values: SQLInputValue[] }>();
  const statement = (text: string, values: SQLInputValue[] = []): Statement => {
    const s: Statement = {
      bind: (...v) => statement(text, v),
      first: async <T>() => (sql.prepare(text).get(...values) ?? null) as T | null,
      all: async <T>() => ({ results: sql.prepare(text).all(...values) as T[] }),
      run: async () => sql.prepare(text).run(...values),
    };
    bound.set(s, { text, values });
    return s;
  };
  return {
    sql,
    prepare: text => statement(text),
    // Like D1: one transaction, all or nothing.
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const out = statements.map(s => {
          const { text, values } = bound.get(s)!;
          return { results: sql.prepare(text).all(...values) };
        });
        sql.exec('COMMIT');
        return out;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
