import path from 'node:path';

import { DevTools } from '@vitejs/devtools';
import type { PluginOption, ViteDevServer } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { createDevProxyPrintPlugin } from './plugins/vite/devProxyPrint';
import { viteEnvRestartKeys } from './plugins/vite/envRestartKeys';
import {
  createSharedRolldownOutput,
  sharedModulePreload,
  sharedOptimizeDeps,
  sharedRendererDefine,
  sharedRendererPlugins,
} from './plugins/vite/sharedRendererConfig';
import { vercelSkewProtection } from './plugins/vite/vercelSkewProtection';

const isMobile = process.env.MOBILE === 'true';
const isAuth = process.env.AUTH === 'true';
const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';

Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

const isDev = process.env.NODE_ENV !== 'production';
const platform = isAuth ? 'auth' : isMobile ? 'mobile' : 'web';
const enableViteDevTools = process.env.LOBE_VITE_DEVTOOLS === 'true';

if (isDev) process.title = `lobe-dev-vite-${platform}`;

const devTopology = process.env.LOBE_DEV_TOPOLOGY;
const honoLite = devTopology === 'hono-lite' || devTopology === 'hono';
const apiTarget = honoLite
  ? `http://localhost:${process.env.HONO_PORT || 3011}`
  : `http://localhost:${process.env.PORT || 3010}`;

export default defineConfig({
  base: isDev ? '/' : process.env.VITE_CDN_BASE || (isAuth ? '/_spa-auth/' : '/_spa/'),
  build: {
    modulePreload: sharedModulePreload,
    outDir: isAuth ? 'dist/auth' : isMobile ? 'dist/mobile' : 'dist/desktop',
    reportCompressedSize: false,
    rolldownOptions: {
      ...(enableViteDevTools && { devtools: {} }),
      input: path.resolve(
        __dirname,
        isAuth ? 'index.auth.html' : isMobile ? 'index.mobile.html' : 'index.html',
      ),
      output: createSharedRolldownOutput({ strictExecutionOrder: true }),
    },
  },
  define: sharedRendererDefine({ isMobile, isElectron: false }),
  experimental: {
    bundledDev: false,
  },
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: sharedOptimizeDeps,
  plugins: [
    vercelSkewProtection(),
    viteEnvRestartKeys(['APP_URL']),
    enableViteDevTools &&
      DevTools({
        build: {
          withApp: true,
        },
      }),
    ...sharedRendererPlugins({ platform }),

    isDev && {
      name: 'spa-html-dev-entry',
      enforce: 'pre' as const,
      configureServer(server: ViteDevServer) {
        const AUTH_PATH_PREFIXES = [
          '/signin',
          '/signup',
          '/verify-email',
          '/reset-password',
          '/auth-error',
          '/market-auth-callback',
        ];
        server.middlewares.use((req, _res, next) => {
          const raw = req.url;
          if (!raw) return next();
          const q = raw.indexOf('?');
          const pathOnly = q === -1 ? raw : raw.slice(0, q);
          const search = q === -1 ? '' : raw.slice(q);
          const isAsset =
            pathOnly.includes('.') ||
            pathOnly.startsWith('/@') ||
            pathOnly.startsWith('/__') ||
            pathOnly.startsWith('/node_modules');
          if (isAsset) return next();
          // Dedicated AUTH=true / MOBILE=true dev servers always serve their bundle.
          if (isAuth) {
            req.url = `/index.auth.html${search}`;
            return next();
          }
          if (isMobile) {
            req.url = `/index.mobile.html${search}`;
            return next();
          }
          // Main SPA: route known auth paths to the auth bundle so /signin et al.
          // render without needing a separate dev server.
          if (AUTH_PATH_PREFIXES.some((p) => pathOnly === p || pathOnly.startsWith(`${p}/`))) {
            req.url = `/index.auth.html${search}`;
          }
          next();
        });
      },
    },

    isDev && createDevProxyPrintPlugin(),

    !isAuth &&
      VitePWA({
        injectRegister: null,
        manifest: false,
        registerType: 'prompt',
        workbox: {
          globPatterns: ['**/*.{js,css,html,woff2}'],
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          runtimeCaching: [
            {
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts-stylesheets' },
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            },
            {
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: { maxAgeSeconds: 60 * 60 * 24 * 365, maxEntries: 30 },
              },
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            },
            {
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'image-assets',
                expiration: { maxAgeSeconds: 60 * 60 * 24 * 30, maxEntries: 100 },
              },
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|avif)$/i,
            },
            {
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: { maxAgeSeconds: 60 * 5, maxEntries: 50 },
              },
              urlPattern: /\/(api|trpc)\/.*/i,
            },
          ],
        },
      }),
  ].filter(Boolean) as PluginOption[],

  server: {
    cors: true,
    host: true,
    port: 9876,
    proxy: {
      '/api': apiTarget,
      '/f': apiTarget,
      '/market': apiTarget,
      '/oauth': apiTarget,
      '/oidc': apiTarget,
      '/trpc': apiTarget,
      '/webapi': apiTarget,
    },
    warmup: {
      clientFiles: [
        // src/ business code
        './src/initialize.ts',
        './src/spa/**/*.tsx',
        './src/business/**/*.{ts,tsx}',
        './src/components/**/*.{ts,tsx}',
        './src/const/**/*.ts',
        './src/features/**/*.{ts,tsx}',
        './src/helpers/**/*.ts',
        './src/hooks/**/*.{ts,tsx}',
        './src/layout/**/*.{ts,tsx}',
        './src/libs/**/*.{ts,tsx}',
        './src/routes/**/*.{ts,tsx}',
        './src/services/**/*.ts',
        './src/store/**/*.{ts,tsx}',
        './src/styles/**/*.ts',
        './src/utils/**/*.{ts,tsx}',

        // monorepo packages
        './packages/types/src/**/*.ts',
        './packages/const/src/**/*.ts',
        './packages/utils/src/**/*.ts',
        './packages/context-engine/src/**/*.ts',
        './packages/prompts/src/**/*.ts',
        './packages/model-bank/src/**/*.ts',
        './packages/model-runtime/src/**/*.ts',
        './packages/agent-runtime/src/**/*.ts',
        './packages/conversation-flow/src/**/*.ts',
        './packages/electron-client-ipc/src/**/*.ts',
        './packages/builtin-agents/src/**/*.ts',
        './packages/builtin-skills/src/**/*.ts',
        './packages/builtin-tool-*/src/**/*.ts',
        './packages/builtin-tools/src/**/*.ts',
        './packages/business/*/src/**/*.ts',
        './packages/business-server/src/**/*.ts',
        './packages/config/src/**/*.ts',
        './packages/edge-config/src/**/*.ts',
        './packages/editor-runtime/src/**/*.ts',
        './packages/env/src/**/*.ts',
        './packages/trpc/src/**/*.{ts,tsx}',
        './packages/app-config/src/**/*.ts',
        './packages/locales/src/**/*.ts',
        './packages/fetch-sse/src/**/*.ts',
        './packages/desktop-bridge/src/**/*.ts',
        './packages/python-interpreter/src/**/*.ts',
        './packages/agent-manager-runtime/src/**/*.ts',
      ],
    },
    watch: {
      ignored: ['**/e2e/reports/**', '**/e2e/screenshots/**'],
    },
  },
});
