/**
 * Playwright configuration for BangBang3D smoke tests
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.(spec|test)\.js$|smoke-test\.js$/,
  
  // Test timeout
  timeout: 60000,
  
  // Run tests serially (not in parallel) to avoid port conflicts
  fullyParallel: false,
  workers: 1,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Reporter
  reporter: [
    ['html', { outputFolder: 'tests/playwright-report' }],
    ['list']
  ],
  
  // Shared settings for all projects
  use: {
    // Base URL for tests
    baseURL: 'http://localhost:8765',
    
    // Collect trace on failure
    trace: 'on-first-retry',
    
    // Screenshot on failure
    screenshot: 'only-on-failure',
    
    // Video on failure
    video: 'retain-on-failure'
  },
  
  // Configure projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // GPU tests require headed mode (WebGPU/WebGL2 don't work properly in headless)
        // This is a known limitation of Chromium's GPU stack in headless mode.
        // Tests are designed for local development only.
        headless: false,
        // Enable WebGPU support
        launchOptions: {
          args: [
            '--enable-unsafe-webgpu',
            '--enable-features=Vulkan'
          ]
        }
      }
    }
  ],
  
  // Web server configuration
  webServer: {
    command: 'node tests/server.js',
    port: 8765,
    timeout: 10000,
    reuseExistingServer: !process.env.CI
  }
});
