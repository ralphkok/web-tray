const path = require('path');
const { menubar } = require('menubar');
const { BrowserWindow, Menu, ipcMain } = require('electron');
const url = require('url');
const { readFile, writeFile } = require('fs');
const sharp = require('sharp');

const commandLineArgs = require('command-line-args');
const args = commandLineArgs([
  { name: 'debug', alias: 'd', type: Boolean }
]);

const baseDir = args.debug
  ? path.resolve(__dirname)
  : path.join(__dirname, '..');

let isQuitRequested = false;

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
 * Open a window with configuration preferences.
 */
const openConfigWindow = () => {
  // create config window
  const configWindow = new BrowserWindow({
    show: true,
    autoHideMenuBar: false,
    movable: true,
    resizable: true,
    focusable: true,
    closable: true,
    webPreferences: {
      nodeIntegration: true
    },
  });
  // load the config page
  configWindow.loadURL(url.format({
    pathname: path.join(baseDir, 'assets/config.html'),
    protocol: 'file:',
    slashes: true
  }));
  // show developer tools when in debug mode
  if (args.debug) {
    configWindow.webContents.openDevTools();
  }
  // Prevent closing of the aplication when the window closes
  configWindow.on('close', event => {
    if (!isQuitRequested) {
      event.preventDefault();
      configWindow.hide();
      return false;
    }
    return true;
  });
}

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

/**
 * Save config settings to file
 * @param {*} config 
 */
const writeConfig = (config) => (
  new Promise((resolve, reject) => {
    const configPath = path.join(baseDir, 'assets/config.json');
    console.log(JSON.stringify(config, "\t"));
    writeFile(configPath, JSON.stringify(config, null, "\t"), resolve);
  })
);

/**
 * Load an image and return it as a base64 encoded string
 * @param {*} icon 
 */
const getBase64 = (icon) => (
  new Promise((resolve, reject) => {
    readFile(icon, (err, img) => {
      if (!err && img) {
        // convert image to base64 encoded string
        resolve(Buffer.from(img).toString('base64'));
      } else {
        reject(err);
      }
    });
  })
);

/**
 * Save image data to file for the tray icon
 * @param {*} icon Base64 encoded string representing the icon
 * @param {*} isLargeIcon Whether or not the data represents the larger variation of the icon or not
 */
const saveTrayIcon = async (icon, isLargeIcon) => {
  const [ imageType, base64 ] = icon.split('base64,');
  if (base64) {
    const fileName = `tray${isLargeIcon ? '@2x' : ''}.png`;
    const filePath = path.join(baseDir, `assets/icons/${fileName}`);
    await writeBase64ToFile(base64, filePath);
  }
};

const writeBase64ToFile = (base64, filePath) => (
  new Promise((resolve, reject) => {
    writeFile(filePath, base64, 'base64', err => {
      if (err) {
        reject(err);
      } else {
        resolve();
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
      ? path.resolve(mb.app.getAppPath(), 'assets/icons/tray.png')
      : path.resolve(mb.app.getAppPath(), '..', 'assets/icons/tray.png')
    );

    // create context menu
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Reload window', click: () => mb.window.reload() },
      { label: 'Preferences', click: openConfigWindow },
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

  /**
   * Return config data from file
   */
  ipcMain.on('get-app-config', async event => {
    // load config from file
    const { title, icon, url } = await readConfig();
    // load icon
    getBase64(icon)
      .then(base64 => {
        // send response with config data
        event.reply('get-app-config-response', {
          title,
          icon: base64,
          url
        });
      })
      .catch(err => {
        console.error(err);
        // send response with empty icon
        event.reply('get-app-config-response', {
          title,
          icon: '',
          url
        });
      });
  });

  /**
   * Store app config data in JSON file
   */
  ipcMain.on('set-app-config', async (event, title, url, iconLarge, iconSmall) => {
    try {
      if (iconLarge && iconSmall) {
        await saveTrayIcon(iconLarge, true);
        await saveTrayIcon(iconSmall, false);
      }
      const config = await readConfig();
      await writeConfig({
        ...config,
        title,
        url
      });
      event.reply('set-app-config-response', null);
      mb.app.setName(title);
      mb.index = url;
      if (mb.window) {
        mb.window.loadURL(url);
      }
    } catch (err) {
      event.reply('set-app-config-response', err.toString());
    }
  });
};

start();