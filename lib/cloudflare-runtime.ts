export interface D1Result<T = Record<string, unknown>> {
  results: T[];
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

export interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
}

/**
 * Loads Cloudflare bindings without making `cloudflare:workers` a build-time
 * dependency. Vercel can therefore compile the app, while the existing Sites
 * runtime can still provide D1/R2 bindings when it is present.
 */
export async function getCloudflareRuntime<T>(): Promise<T | null> {
  if (process.env.VERCEL) return null;

  try {
    const dynamicImport = new Function(
      "specifier",
      "return import(specifier)",
    ) as (specifier: string) => Promise<{ env?: unknown }>;
    const runtime = await dynamicImport("cloudflare:workers");
    return (runtime.env ?? null) as T | null;
  } catch {
    return null;
  }
}
