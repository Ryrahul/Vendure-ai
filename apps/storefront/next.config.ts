import {NextConfig} from 'next';

const nextConfig: NextConfig = {
    cacheComponents: true,
    images: {
        // This is necessary to display images from your local Vendure instance
        dangerouslyAllowLocalIP: true,
        remotePatterns: [
            {
                hostname: 'readonlydemo.vendure.io',
            },
            {
                hostname: 'demo.vendure.io'
            },
            {
                hostname: 'localhost'
            },
            {
                hostname: '3.110.193.232'
            },
            {
                hostname: 'ai-vendure.hyperce.io'
            }
        ],
    },
    experimental: {
        rootParams: true
    }
};

export default nextConfig;