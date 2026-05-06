/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    async redirects() {
        return [
            {
                source: '/leader',
                destination: '/payment',
                permanent: false,
            },
        ];
    },
};

module.exports = nextConfig;
