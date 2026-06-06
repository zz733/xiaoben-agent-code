import { t } from "../locale.js";

const KEY_MAP: Record<string, string> = {
  "Auto-update is not available in development mode.": "updater.notAvailableInDev",
  "No update available. Check for updates first.": "updater.noUpdateAvailable",
  "Update downloaded. The app will restart shortly.": "updater.downloaded",
  "Update is still being prepared. Try again in a moment.": "updater.preparing",
};

export function translateUpdateMessage(message: string): string {
  const key = KEY_MAP[message];
  if (!key) {
    if (message.startsWith("Update failed:")) {
      const detail = message.slice("Update failed:".length).trim();
      return t("updater.failed", { message: detail });
    }
    return message;
  }
  return t(key);
}
