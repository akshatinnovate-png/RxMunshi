// STATIC_EXPORT=1 builds a fully static app (no server routes) for the
// Windows (Electron) and Android packages. Those builds run in Demo mode,
// offline, with every record kept on the device.
const isStatic = process.env.STATIC_EXPORT === '1';

/** @type {import('next').NextConfig} */
const nextConfig = isStatic
  ? {
      reactStrictMode: true,
      output: 'export',
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {
      reactStrictMode: true,
      poweredByHeader: false,
      async headers() {
        return [
          {
            source: '/(.*)',
            headers: [
              { key: 'X-Content-Type-Options', value: 'nosniff' },
              { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
              { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
            ],
          },
        ];
      },
    };
export default nextConfig;
