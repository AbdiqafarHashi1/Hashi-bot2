import type { NextConfig } from "next";
import { loadLocalRuntimeEnv } from "@hashi/config";

loadLocalRuntimeEnv();

const nextConfig: NextConfig = {
  output: "standalone"
};

export default nextConfig;
