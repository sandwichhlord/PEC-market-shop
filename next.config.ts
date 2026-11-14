import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The custom server (server.ts) hosts Next and Socket.IO on one port.
  poweredByHeader: false,
};

export default nextConfig;
