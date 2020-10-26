const path = require('path');
const { menubar } = require('menubar');
const { BrowserWindow, Menu } = require('electron');
const { readFile } = require('fs');

const commandLineArgs = require('command-line-args');
const args = commandLineArgs([
  { name: 'debug', alias: 'd', type: Boolean }
]);

const baseDir = args.debug
  ? path.resolve(__dirname)
  : path.join(__dirname, '..');

/**
 * Open new windows in a separate, movable, closable window.
 */
const onNewWindow = (event, url, frameName, disposition, options, additionalFeatures, referrer, postBody) => {
  event.preventDefault();
  const win = new BrowserWindow({
    webContents: options.webContents, // use existing webContents if provided
    show: false,
    autoHideMenuBar: false,
    movable: true,
    resizable: true,
    focusable: true,
    closable: true,
  });
  win.once('ready-to-show', () => win.show());
  if (!options.webContents) {
    const loadOptions = {
      httpReferrer: referrer
    };
    if (postBody != null) {
      const { data, contentType, boundary } = postBody;
      loadOptions.postData = postBody.data;
      loadOptions.extraHeaders = `content-type: ${contentType}; boundary=${boundary}`;
    }

    win.loadURL(url, loadOptions); // existing webContents will be navigated automatically
  }
  event.newGuest = win;
};

/**
 * Load the config settings from file
 */
const readConfig = () => (
  new Promise((resolve, reject) => {
    const configPath = path.join(baseDir, 'assets/config.json');
    readFile(configPath, async (err, data) => {
      if (!err) {
        resolve(JSON.parse(data));
      } else {
        reject(err);
      }
    });
  })
);

const start = async () => {
  const config = await readConfig();

  /**
   * Create the main menubar application.
   */
  const mb = menubar({
    dir: path.resolve(__dirname),
    index: config.url,
    browserWindow: {
      width: 600,
      height: 800,
      movable: true,
      resizable: true,
      focusable: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true
      }
    }
  });

  mb.on('ready', () => {
    // set tray icon
    mb.tray.setImage(
      args.debug
      ? path.resolve(mb.app.getAppPath(), config.icon)
      : path.resolve(mb.app.getAppPath(), '..', config.icon)
    );

    // create context menu
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Reload window', click: () => mb.window.reload() },
      {
        label: 'Quit',
        click: () => {
          isQuitRequested = true;
          mb.app.quit();
        }
      },
    ]);
    mb.tray.on('right-click', () => mb.tray.popUpContextMenu(contextMenu));
  });

  /**
   * Listen for new windows being opened.
   */
  mb.on('after-create-window', async () => {
    mb.window.webContents.on('new-window', onNewWindow);
    const { url } = await readConfig();
    if (mb.window.url !== url) {
      mb.window.loadURL(url);
    }
  });

};

start();