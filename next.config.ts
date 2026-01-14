import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  
  // Configure webpack for WASM support (required for occt-import-js)
  webpack: (config, { isServer }) => {
    // Enable WebAssembly support
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Handle .wasm files - copy them to output and make them available
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
      generator: {
        filename: "static/wasm/[name].[hash][ext]",
      },
    });

    // Ensure WASM files are not processed as ES modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };

    return config;
  },
  
  // Add empty turbopack config to silence the warning (we're using webpack for WASM)
  turbopack: {},
};

export default nextConfig;
