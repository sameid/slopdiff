#!/usr/bin/env bash
#
# gen-demo-diff.sh — emit a realistic-looking unified diff for demoing slopdiff.
#
# Usage:
#   ./gen-demo-diff.sh            # print the diff to stdout
#   ./gen-demo-diff.sh | slopdiff # pipe straight into the app for a screenshot
#
# It writes nothing to disk and needs no real repo — the diff is hand-crafted
# to show off adds, deletes, context, renames, and a multi-file change.

cat <<'DIFF'
diff --git a/src/cache.js b/src/cache.js
index 8f3a1b2..c4d9e07 100644
--- a/src/cache.js
+++ b/src/cache.js
@@ -1,24 +1,36 @@
-// A tiny in-memory cache keyed by string with a single global expiry.
-class Cache {
-  constructor(ttlSeconds = 60) {
-    this.store = new Map();
-    this.ttlSeconds = ttlSeconds;
-  }
+/**
+ * A small in-memory cache with per-entry TTL and optional max-size eviction.
+ * Entries are stored as { timestamp, value } so each key expires independently.
+ */
+class Cache {
+  constructor({ ttlSeconds = 60, maxEntries = 1000 } = {}) {
+    this.store = new Map();
+    this.ttlMillis = ttlSeconds * 1000;
+    this.maxEntries = maxEntries;
+  }

   get(key) {
-    return this.store.get(key);
+    const entry = this.store.get(key);
+    if (entry === undefined) return null;
+    if (Date.now() - entry.timestamp > this.ttlMillis) {
+      this.store.delete(key);
+      return null;
+    }
+    return entry.value;
   }

   set(key, value) {
-    this.store.set(key, value);
+    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
+      const oldestKey = this.store.keys().next().value;
+      this.store.delete(oldestKey);
+    }
+    this.store.set(key, { timestamp: Date.now(), value });
   }
 }

-module.exports = Cache;
+export default Cache;
diff --git a/src/server.js b/src/server.js
index 1a2b3c4..5d6e7f8 100644
--- a/src/server.js
+++ b/src/server.js
@@ -8,12 +8,18 @@ import Cache from "./cache.js";

 const app = express();
-const userCache = new Cache();
+const userCache = new Cache({ ttlSeconds: 120, maxEntries: 5000 });

 app.get("/users/:id", async (req, res, next) => {
-  const user = await db.fetchUserById(req.params.id);
-  res.json(user);
+  const cacheKey = `user:${req.params.id}`;
+  const cachedUser = userCache.get(cacheKey);
+  if (cachedUser !== null) {
+    res.set("X-Cache", "HIT").json(cachedUser);
+    return;
+  }
+
+  const user = await db.fetchUserById(req.params.id);
+  userCache.set(cacheKey, user);
+  res.set("X-Cache", "MISS").json(user);
 });
diff --git a/README.md b/README.md
index 7c8d9e0..2f1a3b4 100644
--- a/README.md
+++ b/README.md
@@ -1,7 +1,9 @@
 # nimbus

-A small async API service built on top of Express and a thin database layer.
+A small async API service built on Express with a thin database layer and TTL response caching.

 ## Features

 - Async request handling with structured error middleware
+- In-memory TTL cache with per-entry expiry and size-bounded eviction
+- Cache hit/miss reporting via the `X-Cache` response header
diff --git a/src/utils/timer.js b/src/clock.js
similarity index 84%
rename from src/utils/timer.js
rename to src/clock.js
index 9e0f1a2..3b4c5d6 100644
--- a/src/utils/timer.js
+++ b/src/clock.js
@@ -1,5 +1,5 @@
-// Returns the current wall-clock time in milliseconds since the Unix epoch.
-export function now() {
-  return Date.now();
-}
+// Returns a high-resolution monotonic timestamp suitable for measuring durations.
+export function now() {
+  return performance.now();
+}
DIFFIFFIFF
