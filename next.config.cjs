/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Standalone output for Docker/Koyeb deployment
  output: 'standalone',

  // Exclude ChromaDB from client-side bundles (server-only)
  experimental: {
    serverComponentsExternalPackages: ['chromadb'],
  },

  // Production optimizations
  poweredByHeader: false, // Remove X-Powered-By header for security
  compress: true, // Enable gzip compression

  // Image optimization
  images: {
    domains: [],
    formats: ['image/avif', 'image/webp'],
  },

  // Security and performance headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate'
          },
        ],
      },
    ]
  },

  // Webpack configuration for production optimization
  webpack: (config, { isServer, webpack }) => {
    // CRITICAL FIX: Replace ChromaDB's optional dependencies with a dummy module
    // ChromaDB has optional dependencies that cause build failures
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /@chroma-core\/default-embed/,
        require.resolve('./webpack-dummy.js')
      )
    );

    // Ignore optional dependencies from chromadb
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@chroma-core/default-embed': false,
    };

    if (!isServer) {
      // Client-side: completely exclude ChromaDB
      config.resolve.alias = {
        ...config.resolve.alias,
        'chromadb': false,
      };
    }

    // Server-side: Handle externals properly
    if (isServer) {
      const originalExternals = config.externals;

      config.externals = async (context, request, callback) => {
        // Externalize chromadb and its optional dependencies
        if (request === 'chromadb' || request.startsWith('@chroma-core/')) {
          return callback(null, `commonjs ${request}`);
        }

        // Call original externals logic
        if (typeof originalExternals === 'function') {
          return originalExternals(context, request, callback);
        } else if (Array.isArray(originalExternals)) {
          for (const external of originalExternals) {
            if (typeof external === 'function') {
              const result = await external(context, request, callback);
              if (result !== undefined) return result;
            }
          }
        }

        callback();
      };
    }

    // Production optimizations
    if (!isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          default: false,
          vendors: false,
          // Vendor chunk
          vendor: {
            name: 'vendor',
            chunks: 'all',
            test: /node_modules/,
            priority: 20
          },
          // Common chunk
          common: {
            name: 'common',
            minChunks: 2,
            chunks: 'all',
            priority: 10,
            reuseExistingChunk: true,
            enforce: true
          }
        }
      }
    }
    return config
  },

  // TypeScript configuration
  typescript: {
    // Type checking is done in CI/CD pipeline
    ignoreBuildErrors: false,
  },

  // ESLint configuration
  eslint: {
    // Linting is done in CI/CD pipeline
    ignoreDuringBuilds: false,
  },
}

module.exports = nextConfig
