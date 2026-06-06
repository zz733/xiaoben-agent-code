import { app, Menu, BrowserWindow, ipcMain } from "electron";
import { t, onLocaleChanged } from "../locale.js";
import { getWorkspaceActivePaseoBrowserWebContents } from "../../features/browser-webviews.js";

interface ApplicationMenuOptions {
  onNewWindow: () => void;
}

function withBrowserWindow(
  callback: (win: BrowserWindow) => void,
): (_item: Electron.MenuItem, baseWin: Electron.BaseWindow | undefined) => void {
  return (_item, baseWin) => {
    const win = baseWin instanceof BrowserWindow ? BrowserWindow.getFocusedWindow() : undefined;
    if (win) callback(win);
  };
}

function getReloadTargetBrowserWebContents(): Electron.WebContents | null {
  return getWorkspaceActivePaseoBrowserWebContents();
}

function reloadFocusedContentsOrWindow(win: BrowserWindow, options?: { ignoreCache?: boolean }) {
  const browserContents = getReloadTargetBrowserWebContents();
  if (browserContents) {
    if (options?.ignoreCache) {
      browserContents.reloadIgnoringCache();
      return;
    }
    if (browserContents.isLoadingMainFrame()) {
      browserContents.stop();
      return;
    }
    browserContents.reload();
    return;
  }

  if (options?.ignoreCache) {
    win.webContents.reloadIgnoringCache();
    return;
  }
  win.webContents.reload();
}

function buildLocalizedMenuTemplate(
  options: ApplicationMenuOptions,
): Electron.MenuItemConstructorOptions[] {
  const isMac = process.platform === "darwin";

  return [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: t("menu.file"),
      submenu: [
        {
          label: t("menu.file.newWindow"),
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => {
            options.onNewWindow();
          },
        },
      ],
    },
    {
      label: t("menu.edit"),
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: t("menu.view"),
      submenu: [
        {
          label: t("menu.view.zoomIn"),
          accelerator: "CmdOrCtrl+=",
          click: withBrowserWindow((win) => {
            win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5);
          }),
        },
        {
          label: t("menu.view.zoomOut"),
          accelerator: "CmdOrCtrl+-",
          click: withBrowserWindow((win) => {
            win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5);
          }),
        },
        {
          label: t("menu.view.actualSize"),
          accelerator: "CmdOrCtrl+0",
          click: withBrowserWindow((win) => {
            win.webContents.setZoomLevel(0);
          }),
        },
        { type: "separator" },
        {
          label: t("menu.view.reload"),
          accelerator: "CmdOrCtrl+R",
          click: withBrowserWindow((win) => {
            reloadFocusedContentsOrWindow(win);
          }),
        },
        {
          label: t("menu.view.forceReload"),
          accelerator: "CmdOrCtrl+Shift+R",
          click: withBrowserWindow((win) => {
            reloadFocusedContentsOrWindow(win, { ignoreCache: true });
          }),
        },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: t("menu.window"),
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" as const }, { role: "front" as const }]
          : [{ role: "close" as const }]),
      ],
    },
  ];
}

export function patchApplicationMenu(options: ApplicationMenuOptions): void {
  const rebuild = () => {
    const template = buildLocalizedMenuTemplate(options);
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  };

  rebuild();

  onLocaleChanged(() => {
    rebuild();
  });

  ipcMain.removeHandler("paseo:menu:showContextMenu");
  ipcMain.handle(
    "paseo:menu:showContextMenu",
    (event, input?: { kind?: string; hasSelection?: boolean }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return;
      if (input?.kind !== "terminal") return;

      const contextMenu = Menu.buildFromTemplate([
        {
          label: t("menu.terminal.copy"),
          role: "copy",
          enabled: input.hasSelection === true,
        },
        {
          label: t("menu.terminal.paste"),
          role: "paste",
        },
        { type: "separator" },
        {
          label: t("menu.terminal.selectAll"),
          role: "selectAll",
        },
      ]);
      contextMenu.popup({ window: win });
    },
  );
}
