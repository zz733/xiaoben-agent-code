import { setupI18n } from "./locale.js";
import { patchApplicationMenu } from "./patches/menu.js";
import { patchDialogHandlers } from "./patches/dialogs.js";
import { patchContextMenu } from "./patches/context-menu.js";

interface ApplicationMenuOptions {
  onNewWindow: () => void;
}

export function installPatchers(options: ApplicationMenuOptions): void {
  setupI18n();
  patchApplicationMenu(options);
  patchDialogHandlers();
  patchContextMenu();
}

export {
  setupI18n,
  t,
  setLocale,
  getCurrentLocale,
  onLocaleChanged,
  getAvailableLocales,
} from "./locale.js";
export type { LocaleId } from "./locale.js";
export { patchApplicationMenu } from "./patches/menu.js";
export { patchDialogHandlers } from "./patches/dialogs.js";
export { patchContextMenu } from "./patches/context-menu.js";
export { translateUpdateMessage } from "./patches/auto-updater.js";
