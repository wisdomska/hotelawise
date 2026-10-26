// Raw `db.execute(sql…)` returns driver-specific results; both drivers we use
// (neon-serverless and node-postgres) expose the rows on `.rows`.
export function rowsOf<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}
