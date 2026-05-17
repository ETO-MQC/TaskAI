import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEV_HOST, findAvailableDevPort } from "./port-utils.mjs";

const port = Number(process.env.SMARTFOCUS_DEV_PORT) || await findAvailableDevPort();
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
const child = spawn(process.execPath, [viteBin], {
  stdio: "inherit",
  env: {
    ...process.env,
    SMARTFOCUS_DEV_HOST: DEV_HOST,
    SMARTFOCUS_DEV_PORT: String(port),
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
