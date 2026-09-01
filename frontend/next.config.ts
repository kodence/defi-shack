import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // This is not an npm workspace: backend/ and frontend/ each install their
    // own dependencies, so the repo legitimately has three lockfiles. Without
    // pinning this, Next infers the workspace root from the repo-level
    // package-lock.json and warns that its guess may be wrong. The frontend
    // package is self-contained, so it is its own root.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
