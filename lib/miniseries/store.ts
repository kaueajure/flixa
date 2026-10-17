import type { MiniTitle } from "./types.ts";

export type CacheEntry<T = unknown> = { value: T; expiresAt: number; staleUntil: number };
export interface MiniStore {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  put(key: string, value: unknown, ttl: number, stale?: number): Promise<void>;
  lease(key: string, owner: string, ms: number): Promise<boolean>;
  release(key: string, owner: string): Promise<void>;
  reserve(key: string, units: number, limit: number, ms: number): Promise<boolean>;
  budgetUsage(key: string): Promise<{ units: number; expiresAt: number } | null>;
  titles(): Promise<MiniTitle[]>;
  title(id: string): Promise<MiniTitle | null>;
  save(title: MiniTitle, absorbed?: string[]): Promise<void>;
  prune(): Promise<void>;
}
