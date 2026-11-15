import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { resolveProviderName } from "./src/server/payments/index";
import { attachRealtime } from "./src/server/realtime/server";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = "localhost";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

// Behind a reverse proxy set TRUST_PROXY=true to keep its X-Forwarded-For. Otherwise the header is replaced with the
// socket address, so clients cannot pick their own IP for the login rate limit.
const trustProxy = process.env.TRUST_PROXY === "true";

const httpServer = createServer((req, res) => {
  if (!trustProxy) req.headers["x-forwarded-for"] = req.socket.remoteAddress ?? "";
  void handle(req, res);
});

// destroyUpgrade: false leaves non-Socket.IO upgrades (Next's dev HMR websocket) alone.
const io = new Server(httpServer, { path: "/socket.io", destroyUpgrade: false });
attachRealtime(io);
globalThis.io = io;

httpServer.listen(port, () => {
  console.log(`> PEC Market ready on http://${hostname}:${port} (${dev ? "dev" : "production"})`);
  let provider: string;
  try {
    provider = resolveProviderName();
  } catch (err) {
    provider = `misconfigured (${(err as Error).message})`;
  }
  console.log(`> Payments: ${provider}`);
  if (!dev && provider === "mock") {
    console.warn("> WARNING: mock payments are active in production: anyone can mark their own orders paid. Set STRIPE_SECRET_KEY for real payments.");
  }
});

function shutdown() {
  void io.close();
  httpServer.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
