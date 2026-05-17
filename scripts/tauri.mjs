import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEV_HOST, findAvailableDevPort } from "./port-utils.mjs";

const args = process.argv.slice(2);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriBin = path.join(rootDir, "node_modules", "@tauri-apps", "cli", "tauri.js");
const devScript = path.join(rootDir, "scripts", "dev.mjs");

function waitForPort(port, host = DEV_HOST, attempts = 40) {
  return new Promise((resolve, reject) => {
    const tryConnect = (remaining) => {
      const socket = net.createConnection({ host, port });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (remaining <= 1) {
          reject(new Error(`Vite did not become ready on ${host}:${port}.`));
          return;
        }
        setTimeout(() => tryConnect(remaining - 1), 250);
      });
    };
    tryConnect(attempts);
  });
}

async function run() {
  if (args[0] !== "dev") {
    const child = spawn(process.execPath, [tauriBin, ...args], { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  const port = await findAvailableDevPort();
  const override = JSON.stringify({
    build: {
      devUrl: `http://${DEV_HOST}:${port}`,
      beforeDevCommand: null,
    },
  });
  console.log(`[smartfocus] using dev server http://${DEV_HOST}:${port}`);
  const viteChild = spawn(process.execPath, [devScript], {
    stdio: "inherit",
    env: {
      ...process.env,
      SMARTFOCUS_DEV_HOST: DEV_HOST,
      SMARTFOCUS_DEV_PORT: String(port),
    },
  });
  await waitForPort(port);
  const child = spawn(process.execPath, [tauriBin, "dev", "--config", override], {
    stdio: "inherit",
    env: {
      ...process.env,
      SMARTFOCUS_DEV_HOST: DEV_HOST,
      SMARTFOCUS_DEV_PORT: String(port),
    },
  });
  child.on("exit", (code) => {
    viteChild.kill();
    process.exit(code ?? 0);
  });
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
