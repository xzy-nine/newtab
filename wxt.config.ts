import { readFileSync } from "node:fs";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as {
  version: string;
};

const extensionVersion = packageJson.version;

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  hooks: {
    "build:publicAssets": (wxt, files) => {
      const fs = require("node:fs");
      const path = require("node:path");

      const keepPrefixes = ["_locales/", "icons/"];
      for (let j = files.length - 1; j >= 0; j--) {
        const relativeDest = files[j].relativeDest;
        const shouldKeep = keepPrefixes.some((prefix) => relativeDest.startsWith(prefix));
        if (!shouldKeep) {
          files.splice(j, 1);
        }
      }

      const localesDir = path.join(wxt.config.root, "public", "_locales");
      if (fs.existsSync(localesDir)) {
        const localeFiles = fs.readdirSync(localesDir, { recursive: true });
        localeFiles.forEach((file: string) => {
          const fullPath = path.join(localesDir, file);
          if (fs.statSync(fullPath).isFile()) {
            const dest = path.join("_locales", file);
            if (!files.some((f) => f.relativeDest === dest)) {
              files.push({
                absoluteSrc: fullPath,
                relativeDest: dest,
              });
            }
          }
        });
      }

      const iconsDir = path.join(wxt.config.root, "public", "icons");
      if (fs.existsSync(iconsDir)) {
        const iconFiles = fs.readdirSync(iconsDir);
        iconFiles.forEach((file: string) => {
          const fullPath = path.join(iconsDir, file);
          if (fs.statSync(fullPath).isFile()) {
            const dest = path.join("icons", file);
            if (!files.some((f) => f.relativeDest === dest)) {
              files.push({
                absoluteSrc: fullPath,
                relativeDest: dest,
              });
            }
          }
        });
      }
    },
  },
  manifest: {
    name: "__MSG_appName__",
    description: "__MSG_appDescription__",
    default_locale: "zh_CN",
    icons: {
      16: "icons/icon16.png",
      19: "icons/icon19.png",
      32: "icons/icon32.png",
      38: "icons/icon38.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png",
    },
    version: extensionVersion,
    version_name: extensionVersion,
    permissions: [
      "storage",
      "bookmarks",
      "activeTab",
      "tabs",
      "sidePanel",
      "declarativeNetRequestWithHostAccess",
    ],
    host_permissions: ["https://*/*", "http://*/*"],
    action: {
      default_title: "__MSG_extensionTitle__",
      default_icon: {
        16: "icons/icon16.png",
        19: "icons/icon19.png",
        32: "icons/icon32.png",
        38: "icons/icon38.png",
        48: "icons/icon48.png",
        128: "icons/icon128.png",
      },
    },
    web_accessible_resources: [
      {
        resources: ["icons/*"],
        matches: ["<all_urls>"],
      },
    ],
    browser_specific_settings: {
      gecko: {
        id: "@newtab-extension",
        data_collection_permissions: {
          required: ["none"],
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
});
