import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: '', // relative paths
    server: {
      port: 3000,
    },
    plugins: [react()],
    test: {
      environment: 'happy-dom',
    },
    define: {
      // Properly inject REACT_APP_ environment variables
      'process.env.REACT_APP_DEEPL_API_KEY': JSON.stringify(
        env.REACT_APP_DEEPL_API_KEY
      ),
      'process.env.REACT_APP_DEEPL_API_URL': JSON.stringify(
        env.REACT_APP_DEEPL_API_URL
      ),
      'process.env.REACT_APP_SOURCE_LANGUAGE': JSON.stringify(
        env.REACT_APP_SOURCE_LANGUAGE
      ),
      'process.env.REACT_APP_TARGET_LANGUAGE': JSON.stringify(
        env.REACT_APP_TARGET_LANGUAGE
      ),
    },
  };
});
