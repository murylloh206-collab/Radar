import { AsyncLocalStorage } from 'node:async_hooks';
import type { DatabaseSchema } from './storage';

const context = new AsyncLocalStorage<{ database: DatabaseSchema }>();

export function runtimeDatabase() { return context.getStore()?.database; }
export function replaceRuntimeDatabase(database: DatabaseSchema) {
  const current = context.getStore();
  if (current) current.database = structuredClone(database);
}
export async function withCopierDatabase<T>(database: DatabaseSchema, task: () => Promise<T>) {
  const scope = { database: structuredClone(database) };
  const result = await context.run(scope, task);
  return { result, database: scope.database };
}
