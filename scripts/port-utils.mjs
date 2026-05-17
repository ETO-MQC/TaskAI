import net from "node:net";

export const DEV_HOST = "127.0.0.1";
export const DEV_PORT_START = 1438;
export const DEV_PORT_END = 1537;

function canListen(port, host = DEV_HOST) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host, port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function findAvailableDevPort() {
  for (let port = DEV_PORT_START; port <= DEV_PORT_END; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error(`No free SmartFocus dev port found in ${DEV_PORT_START}-${DEV_PORT_END}.`);
}
