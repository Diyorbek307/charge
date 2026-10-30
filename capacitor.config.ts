import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Voli app for Google Play and the App Store.
 *
 * The app opens the live Voli site in its web view (CAP_SERVER_URL), so
 * drivers always have the current version and the API, sign-in and offline
 * packs work exactly as on the web. The built site in dist/ ships inside the
 * app as the fallback. Native parts — Android Auto, CarPlay — live in
 * android/ and ios/ (see docs/native.md).
 */
// The site as deployed today; set CAP_SERVER_URL=https://voli.uz once that domain serves it.
const server = process.env.CAP_SERVER_URL ?? 'https://app.voli.uz';

const config: CapacitorConfig = {
  appId: 'uz.voli.app',
  appName: 'Voli',
  webDir: 'dist',
  server: {
    url: server,
    androidScheme: 'https',
    // Only our own site opens inside the app; everything else (maps, payments) goes to the browser.
    allowNavigation: [new URL(server).host],
  },
  android: {
    // Lets the driver's location and camera work inside the web view.
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;
