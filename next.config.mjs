/** @type {import('next').NextConfig} */
const nextConfig = { poweredByHeader: false, outputFileTracingIncludes: { '/api/**': ['./skills/reports/**/*'] } };
export default nextConfig;
