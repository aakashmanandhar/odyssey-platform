import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Dev only: serve the locally synced snapshot the same way nginx will in production:
//   /odyssey/data/*  -> data/odyssey-local/current/*
//   /odyssey/img/*   -> data/odyssey-local/images/*
const here = path.dirname(fileURLToPath(import.meta.url));
const LOCAL = path.resolve(here, "../data/odyssey-local");
const TYPES: Record<string, string> = {
  ".json": "application/json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
};

function localSnapshot(): Plugin {
  const routes: [string, string][] = [
    ["/odyssey/data/", path.join(LOCAL, "current")],
    ["/odyssey/img/", path.join(LOCAL, "images")],
  ];
  return {
    name: "odyssey-local-snapshot",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? "").split("?")[0]);
        const route = routes.find(([prefix]) => url.startsWith(prefix));
        if (!route) return next();
        const [prefix, dir] = route;
        const file = path.join(dir, url.slice(prefix.length));
        if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader("Content-Type", TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({ base: "/odyssey/", plugins: [react(), localSnapshot()] });
