import process from "node:process";
import { chromium, firefox } from "playwright-core";

export const target = process.env.OMS_BROWSER ?? "edge";

export function launchBrowser() {
  switch (target) {
    case "edge": return chromium.launch({ channel: "msedge", headless: true });
    case "chrome": return chromium.launch({ executablePath: chromium.executablePath(), headless: true });
    case "firefox": return firefox.launch({ headless: true });
    default: throw new Error("Unsupported OMS_BROWSER: " + target);
  }
}
