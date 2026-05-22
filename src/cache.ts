import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const CACHE_DIR = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "opencode-usage")
const CACHE_FILE = join(CACHE_DIR, "last.json")
const CACHE_MAX_AGE_MS = 10 * 60 * 1000

export type CacheNamespace = "claude" | "codex"

interface NamespaceEntry<T> {
  timestamp: number
  result: T
}

interface CacheFile {
  claude?: NamespaceEntry<unknown>
  codex?: NamespaceEntry<unknown>
}

function readCacheFile(): CacheFile {
  try {
    const raw = readFileSync(CACHE_FILE, "utf8")
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === "object") {
      return parsed as CacheFile
    }
  } catch {}
  return {}
}

function writeCacheFile(data: CacheFile): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    const tmpFile = `${CACHE_FILE}.${process.pid}.tmp`
    writeFileSync(tmpFile, JSON.stringify(data), { encoding: "utf8", mode: 0o600 })
    renameSync(tmpFile, CACHE_FILE)
  } catch {}
}

export function readNamespacedCache<T>(ns: CacheNamespace): T | null {
  const file = readCacheFile()
  const entry = file[ns] as NamespaceEntry<T> | undefined
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_MAX_AGE_MS) return null
  if (entry.result === null || entry.result === undefined) return null
  return entry.result
}

export function writeNamespacedCache<T>(ns: CacheNamespace, result: T): void {
  const existing = readCacheFile()
  const updated: CacheFile = {
    ...existing,
    [ns]: { timestamp: Date.now(), result },
  }
  writeCacheFile(updated)
}
