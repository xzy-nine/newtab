import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as {
  version: string
}

const extensionVersion = packageJson.version

export default defineConfig({
  modules: [],
  srcDir: 'src',
  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appDescription__',
    default_locale: 'zh_CN',
    icons: {
      16: 'icons/icon16.png',
      19: 'icons/icon19.png',
      32: 'icons/icon32.png',
      38: 'icons/icon38.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
    version: extensionVersion,
    version_name: extensionVersion,
    background: {
      service_worker: 'html/background.js',
      type: 'module',
    },
    permissions: ['storage', 'bookmarks', 'activeTab', 'tabs'],
    host_permissions: ['https://*/*', 'http://*/*'],
    action: {
      default_popup: 'html/popup.html',
      default_title: '__MSG_extensionTitle__',
      default_icon: {
        16: 'icons/icon16.png',
        19: 'icons/icon19.png',
        32: 'icons/icon32.png',
        38: 'icons/icon38.png',
        48: 'icons/icon48.png',
        128: 'icons/icon128.png',
      },
    },
    chrome_url_overrides: {
      newtab: 'html/newtab.html',
    },
    web_accessible_resources: [
      {
        resources: ['html/*', 'images/*', 'css/*', 'js/*', 'fonts/*', 'icons/icon128.png'],
        matches: ['<all_urls>'],
      },
    ],
    browser_specific_settings: {
      gecko: {
        id: '@newtab-extension',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
  suppressWarnings: {
    firefoxDataCollection: true,
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  dev: {
    server: {
      port: 3112,
    },
  },
})
