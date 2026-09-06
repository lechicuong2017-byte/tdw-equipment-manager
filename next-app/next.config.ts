import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config, { isServer }) {
    // Keep the Node PDF reader native; the browser's worker URL must still be bundled.
    if (isServer) {
      config.externals = [...config.externals, ({ request }: { request?: string }, callback: (error?: Error | null, result?: string) => void) => {
        if (request === "pdfjs-dist/legacy/build/pdf.mjs") callback(null, `import ${request}`);
        else callback();
      }];
    }
    return config;
  },
  outputFileTracingIncludes: {
    "/vehicles": ["./node_modules/pdfjs-dist/legacy/build/*.mjs", "./node_modules/@napi-rs/canvas*/**/*"],
  },
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb",
    },
    typedEnv: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
