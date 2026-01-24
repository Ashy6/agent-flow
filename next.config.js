/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
}

// 开发环境使用代理解决CORS，生产环境静态导出
if (process.env.NODE_ENV === 'production') {
  nextConfig.output = 'export'
} else {
  // 开发环境代理配置
  nextConfig.rewrites = async () => [
    {
      source: '/api/:path*',
      // destination: 'http://150.158.142.132:3000/:path*',
      destination: 'http://localhost:8000/:path*',
    },
  ]
}

module.exports = nextConfig
