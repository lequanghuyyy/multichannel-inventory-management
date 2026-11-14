import type { CapacitorConfig } from '@capacitor/cli';

// Packaged frontend; never put secrets or a development server.url here.
// Native projects are generated and validated in the 22/09 mobile task.
const config: CapacitorConfig = {
  appId: 'com.datt.seller',
  appName: 'Octoflow',
  webDir: 'dist',
  server: { hostname: 'localhost', androidScheme: 'https', iosScheme: 'capacitor' },
};

export default config;
