import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

let tmpCacheDir: string

beforeEach(() => {
  tmpCacheDir = mkdtempSync(join(tmpdir(), "cache-test-"))
  process.env.XDG_CACHE_HOME = tmpCacheDir
  vi.resetModules()
})

afterEach(() => {
  rmSync(tmpCacheDir, { recursive: true, force: true })
  delete process.env.XDG_CACHE_HOME
})

describe("readNamespacedCache / writeNamespacedCache", () => {
  it("returns null when no cache file exists", async () => {
    const { readNamespacedCache } = await import("../cache.js")
    expect(readNamespacedCache("claude")).toBeNull()
    expect(readNamespacedCache("codex")).toBeNull()
  })

  it("writes claude namespace and reads it back", async () => {
    const { readNamespacedCache, writeNamespacedCache } = await import("../cache.js")
    const payload = { foo: "bar" }
    writeNamespacedCache("claude", payload)
    expect(readNamespacedCache<typeof payload>("claude")).toEqual(payload)
  })

  it("writes codex without disturbing existing claude entry", async () => {
    const { readNamespacedCache, writeNamespacedCache } = await import("../cache.js")
    writeNamespacedCache("claude", { side: "claude" })
    writeNamespacedCache("codex", { side: "codex" })
    expect(readNamespacedCache<{ side: string }>("claude")?.side).toBe("claude")
    expect(readNamespacedCache<{ side: string }>("codex")?.side).toBe("codex")
  })

  it("returns null for stale entries beyond max age", async () => {
    const { readNamespacedCache, writeNamespacedCache } = await import("../cache.js")
    writeNamespacedCache("claude", { x: 1 })
    const nowSpy = vi.spyOn(Date, "now")
    nowSpy.mockReturnValue(Date.now() + 11 * 60 * 1000)
    expect(readNamespacedCache("claude")).toBeNull()
    nowSpy.mockRestore()
  })

  it("returns null when cache file contains malformed JSON", async () => {
    const { writeNamespacedCache, readNamespacedCache } = await import("../cache.js")
    writeNamespacedCache("claude", { ok: true })
    const cacheFile = join(tmpCacheDir, "opencode-usage", "last.json")
    const { writeFileSync } = await import("node:fs")
    writeFileSync(cacheFile, "not-json{", { encoding: "utf8" })
    expect(readNamespacedCache("claude")).toBeNull()
  })

  it("returns null when namespace entry has null result", async () => {
    const { writeNamespacedCache, readNamespacedCache } = await import("../cache.js")
    writeNamespacedCache("codex", null)
    expect(readNamespacedCache("codex")).toBeNull()
  })
})
