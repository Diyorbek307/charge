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

/**
 * The same shell is also Voli Business (fleets, in the stores) and Voli Admin
 * (the team only: TestFlight and a closed Play track). VOLI_APP picks which;
 * scripts/native_flavor.py renames the native projects to match (codemagic.yaml).
 */
const FLAVORS = {
  business: { appId: 'uz.voli.business', appName: 'Voli Business' },
  admin: { appId: 'uz.voli.admin', appName: 'Voli Admin' },
} as const;
const flavor = process.env.VOLI_APP === 'business' || process.env.VOLI_APP === 'admin' ? FLAVORS[process.env.VOLI_APP] : null;
const startUrl = flavor ? `${server}/?portal=${process.env.VOLI_APP}` : server;

const config: CapacitorConfig = {
  appId: flavor?.appId ?? 'uz.voli.app',
  appName: flavor?.appName ?? 'Voli',
  webDir: 'dist',
  server: {
    url: startUrl,
    androidScheme: 'https',
    // Only our own site opens inside the app; everything else (maps, payments) goes to the browser.
    allowNavigation: [new URL(server).host],
  },
  android: {
    // Lets the driver's location and camera work inside the web view.
    allowMixedContent: false,
  },
  ios: {
    // The page itself keeps clear of the notch and the home bar (viewport-fit=cover, env() insets):
    // with 'always' iOS shrank the page, leaving an empty strip at the bottom and a stray colour on top.
    contentInset: 'never',
    backgroundColor: '#111111',
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;
