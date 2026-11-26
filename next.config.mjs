/** @type {import('next').NextConfig} */
const nextConfig = { poweredByHeader: false, outputFileTracingIncludes: { '/api/**': ['./skills/reports/**/*','./skills/monitoring/**/*'] } };
export default nextConfig;
