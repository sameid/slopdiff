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
@@ -1,21 +1,30 @@
-// A tiny in-memory cache.
-class Cache {
-  constructor(ttl = 60) {
-    this.store = new Map();
-    this.ttl = ttl;
-  }
+// A tiny in-memory cache with TTL support.
+class Cache {
+  constructor(ttl = 60) {
+    this.store = new Map();
+    this.ttl = ttl * 1000;
+  }

   get(key) {
-    return this.store.get(key);
+    const hit = this.store.get(key);
+    if (hit === undefined) return null;
+    const { ts, value } = hit;
+    if (Date.now() - ts > this.ttl) {
+      this.store.delete(key);
+      return null;
+    }
+    return value;
   }

   set(key, value) {
-    this.store.set(key, value);
+    this.store.set(key, { ts: Date.now(), value });
   }
 }

-module.exports = Cache;
+export default Cache;
diff --git a/src/server.js b/src/server.js
index 1a2b3c4..5d6e7f8 100644
--- a/src/server.js
+++ b/src/server.js
@@ -8,10 +8,14 @@ import Cache from "./cache.js";

 const app = express();
-const cache = new Cache();
+const cache = new Cache(120);

 app.get("/users/:id", async (req, res) => {
-  const user = await db.fetchUser(req.params.id);
-  res.json(user);
+  const key = `user:${req.params.id}`;
+  const cached = cache.get(key);
+  if (cached !== null) return res.json(cached);
+
+  const user = await db.fetchUser(req.params.id);
+  cache.set(key, user);
+  res.json(user);
 });
diff --git a/README.md b/README.md
index 7c8d9e0..2f1a3b4 100644
--- a/README.md
+++ b/README.md
@@ -1,6 +1,8 @@
 # nimbus

-A small async API service.
+A small async API service with response caching.

 ## Features

 - Async request handling
+- In-memory TTL cache
+- Zero external dependencies
diff --git a/src/utils/timer.js b/src/clock.js
similarity index 84%
rename from src/utils/timer.js
rename to src/clock.js
index 9e0f1a2..3b4c5d6 100644
--- a/src/utils/timer.js
+++ b/src/clock.js
@@ -1,3 +1,3 @@
-export function now() {
-  return Date.now();
-}
+export function now() {
+  return performance.now();
+}
DIFFIFF
