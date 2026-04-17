import type { NextConfig } from "next";
import os from "node:os";

function getLocalDevOrigins(): string[] {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);

  const interfaces = os.networkInterfaces();
  for (const values of Object.values(interfaces)) {
    for (const net of values || []) {
      if (net.family === "IPv4" && !net.internal && net.address) {
        hosts.add(net.address);
      }
    }
  }

  return Array.from(hosts);
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["gray-matter"],
  // Next 16 blocks dev-only assets/HMR across origins by default.
  // Allow localhost + local network hosts so ws://<lan-ip>:3000 HMR works.
  allowedDevOrigins: getLocalDevOrigins(),
  turbopack: {},
};

export default nextConfig;
