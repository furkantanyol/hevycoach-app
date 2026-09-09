/**
 * The narrow database seam every server-side check goes through.
 *
 * Only Postgres functions are called, never tables directly: each check the
 * backend performs has to be a single atomic statement, and a `security
 * definer`-free SQL function is the only place that statement can live where
 * two concurrent requests cannot interleave. Keeping the seam this small also
 * means tests supply an object literal rather than a Supabase client.
 */

export interface DatabaseError {
  readonly message: string;
}

export interface DatabaseResult {
  readonly data: unknown;
  readonly error: DatabaseError | null;
}

export interface Database {
  rpc(
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): PromiseLike<DatabaseResult>;
}

export class DatabaseUnavailableError extends Error {
  constructor(operation: string, cause: string) {
    super(`database call ${operation} failed: ${cause}`);
    this.name = 'DatabaseUnavailableError';
  }
}

export async function callDatabase(
  database: Database,
  name: string,
  args: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { data, error } = await database.rpc(name, args);
  if (error !== null) {
    throw new DatabaseUnavailableError(name, error.message);
  }
  return data;
}

interface RpcCapableClient {
  rpc(...args: never[]): unknown;
}

/**
 * Narrows a Supabase client to the seam above.
 *
 * `SupabaseClient.rpc` is typed against generated database types. None are
 * generated here — nothing in the app reads these tables, only the service role
 * does — so the untyped client resolves its argument type to `undefined` and
 * the conversion has to be spelled out. It is spelled out once, here, rather
 * than at each function's entry point.
 */
export function databaseFrom(client: RpcCapableClient): Database {
  return client as unknown as Database;
}
