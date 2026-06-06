import { type MenuItemConstructorOptions, type WebContents } from "electron";
import { t } from "../locale.js";

export function patchContextMenu(): void {
  require("../../window/window-manager.js").buildStandardContextMenuItems = (
    contents: WebContents,
    params: Electron.ContextMenuParams,
  ): MenuItemConstructorOptions[] => {
    const items: MenuItemConstructorOptions[] = [];

    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length > 0) {
        for (const suggestion of params.dictionarySuggestions) {
          items.push({
            label: suggestion,
            click: () => contents.replaceMisspelling(suggestion),
          });
        }
      } else {
        items.push({ label: t("context.noSuggestions"), enabled: false });
      }
      items.push({ type: "separator" });
      items.push({
        label: t("context.addToDictionary"),
        click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
      items.push({ type: "separator" });
    }

    if (params.linkURL && /^https?:/i.test(params.linkURL)) {
      items.push({
        label: t("context.openLinkInBrowser"),
        click: () => {
          void require("electron").shell.openExternal(params.linkURL);
        },
      });
      items.push({
        label: t("context.copyLinkAddress"),
        click: () => require("electron").clipboard.writeText(params.linkURL),
      });
      items.push({ type: "separator" });
    }

    if (params.hasImageContents && params.srcURL) {
      items.push({
        label: t("context.copyImage"),
        click: () => contents.copyImageAt(params.x, params.y),
      });
      items.push({
        label: t("context.saveImageAs"),
        click: () => contents.downloadURL(params.srcURL),
      });
      items.push({ type: "separator" });
    }

    if (params.isEditable) {
      items.push({ role: "cut", enabled: params.editFlags.canCut });
      items.push({ role: "copy", enabled: params.editFlags.canCopy });
      items.push({ role: "paste", enabled: params.editFlags.canPaste });
      items.push({ type: "separator" });
      items.push({ role: "selectAll" });
    } else {
      items.push({ role: "copy", enabled: params.selectionText.length > 0 });
      items.push({ role: "paste" });
      items.push({ type: "separator" });
      items.push({ role: "selectAll" });
    }

    return items;
  };
}
