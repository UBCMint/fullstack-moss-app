/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'export',
    webpack: (config, { isServer }) => {
      // This suppresses the "Critical dependency" warnings
      config.module.unknownContextCritical = false;
  
      if (isServer) {
        config.externals = config.externals || [];
        config.externals.push({
          '@tauri-apps/api/tauri': 'commonjs @tauri-apps/api/tauri',
        });
      }
      return config;
    },
  };
  
  export default nextConfig;
  