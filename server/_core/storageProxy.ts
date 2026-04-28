import type { Express } from "express";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { ENV } from "./env";

function resolveLocalPath(key: string): string {
  const normalized = key.replace(/^\/+/, "");
  const resolved = path.resolve(import.meta.dirname, "..", "..", ".local-storage", normalized);
  const root = path.resolve(import.meta.dirname, "..", "..", ".local-storage");

  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Invalid storage key path");
  }
  return resolved;
}

async function sendLocalFile(res: any, key: string): Promise<boolean> {
  try {
    const localPath = resolveLocalPath(key);
    await access(localPath);
    res.set("Cache-Control", "no-store");
    res.sendFile(localPath);
    return true;
  } catch {
    try {
      // Backward compatibility: older rows may store unhashed keys while the
      // saved local file has a random "_xxxxxxxx" suffix.
      const parsed = path.parse(key);
      const dirPath = resolveLocalPath(parsed.dir || ".");
      const entries = await readdir(dirPath);
      const match = entries.find(
        (name) =>
          name.startsWith(`${parsed.name}_`) &&
          name.endsWith(parsed.ext),
      );

      if (!match) return false;

      const fallbackPath = path.join(dirPath, match);
      await access(fallbackPath);
      res.set("Cache-Control", "no-store");
      res.sendFile(fallbackPath);
      return true;
    } catch {
      return false;
    }
  }
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string | undefined>)["0"];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      if (await sendLocalFile(res, key)) return;
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        if (await sendLocalFile(res, key)) return;
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      if (await sendLocalFile(res, key)) return;
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
