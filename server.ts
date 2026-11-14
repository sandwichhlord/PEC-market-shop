import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { attachRealtime } from "./src/server/realtime/server";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = "localhost";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

const httpServer = createServer((req, res) => {
  void handle(req, res);
});

// destroyUpgrade: false leaves non-Socket.IO upgrades (Next's dev HMR websocket) alone.
const io = new Server(httpServer, { path: "/socket.io", destroyUpgrade: false });
attachRealtime(io);
globalThis.io = io;

httpServer.listen(port, () => {
  console.log(`> PEC Market ready on http://${hostname}:${port} (${dev ? "dev" : "production"})`);
});

function shutdown() {
  void io.close();
  httpServer.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
