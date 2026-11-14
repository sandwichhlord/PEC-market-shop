import type { Server } from "socket.io";

declare global {
  // The Socket.IO server is created in server.ts and shared with route handlers through globalThis.
  var io: Server | undefined;
}

/** The running Socket.IO server, or undefined when no custom server is hosting the app (e.g. unit tests). */
export function getIO(): Server | undefined {
  return globalThis.io;
}
