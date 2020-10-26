const path = require('path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const url = require('url');
const { readFile, writeFile, mkdirSync } = require('fs');

const commandLineArgs = require('command-line-args');
const args = commandLineArgs([
  { name: 'debug', alias: 'd', type: Boolean }
]);

const baseDir = args.debug
? path.resolve(__dirname)
: path.join(__dirname, '..');

const appTemplateDir = path.join(baseDir, 'app-template');

const shelljs = require(args.debug ? 'shelljs' : path.join(baseDir, 'node_modules/shelljs'));

/**
 * Open a window with configuration preferences.
 */
const createWindow = () => {
  // create config window
  const win = new BrowserWindow({
    width: 800,
    height: 600,
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
  win.loadURL(url.format({
    pathname: path.join(baseDir, 'assets/config.html'),
    protocol: 'file:',
    slashes: true
  }));
  // show developer tools when in debug mode
  if (args.debug) {
    win.webContents.openDevTools();
  }
}

app.on('ready', createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (win === null) {
    createWindow();
  }
});

/**
 * Save image data to file for the tray icon
 * @param {*} icon Base64 encoded string representing the icon
 */
const saveAppIcon = async (icon) => {
  const [ imageType, base64 ] = icon.split('base64,');
  if (base64) {
    const dir = path.join(appTemplateDir, `build`);
    mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `icon.png`);
    await writeBase64ToFile(base64, filePath);
  }
};

/**
 * Save image data to file for the tray icon
 * @param {*} icon Base64 encoded string representing the icon
 * @param {*} isLargeIcon Whether or not the data represents the larger variation of the icon or not
 */
const saveTrayIcon = async (icon, isLargeIcon) => {
  const [ imageType, base64 ] = icon.split('base64,');
  if (base64) {
    const dir = path.join(appTemplateDir, `assets/icons`);
    mkdirSync(dir, { recursive: true });
    const fileName = `tray${isLargeIcon ? '@2x' : ''}.png`;
    const filePath = path.join(dir, fileName);
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

/**
 * Save config settings to file
 * @param {*} config 
 */
const writeAppConfig = (config) => (
  new Promise((resolve, reject) => {
    try {
      const dir = path.join(appTemplateDir, 'assets');
      mkdirSync(dir, { recursive: true });
      const configPath = path.join(dir, 'config.json');
      console.log(JSON.stringify(config, "\t"));
      writeFile(configPath, JSON.stringify(config, null, "\t"), resolve);
    } catch (err) {
      reject(err);
    }
  })
);

/**
 * Create a package.json file for the new app, based on a template file
 * @param {*} appTitle 
 */
const createAppPackageFile = async (appTitle) => {
  // load the contents of the template file
  const json = await new Promise((resolve, reject) => {
    readFile(path.join(appTemplateDir, 'package.template.json'), (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(JSON.parse(data))
      }
    });
  });
  const sanitizedAppName = appTitle.toLowerCase().replace(/\s/g, '-');
  const releaseDir = path.join(baseDir, `apps/${sanitizedAppName}`);
  // update the contents based on the app title
  const newContents = JSON.stringify({
    ...json,
    name: sanitizedAppName,
    build: {
      ...json.build,
      productName: appTitle,
      appId: `com.rockabit.webtray.${appTitle.replace(/\s/g, '')}`,
      directories: {
        ...json.build.directories,
        output: releaseDir
      }
    }
  }, null, "\t");
  // write the data to file
  await new Promise((resolve, reject) => {
    writeFile(
      path.join(appTemplateDir, 'package.json'),
      newContents,
      resolve
    )
  });

  return releaseDir;
}

const packageApp = async () => (
  new Promise((resolve, reject) => {
    shelljs.cd(appTemplateDir);
    shelljs.config.execPath = path.join(baseDir, 'node_modules/node/bin/node'); // use node from dependencies
    const { code, stdout, stderr } = shelljs.exec(`npm i && npm run pack`);
    console.log(`ShellJS stdout:`, stdout);
    if (code !== 0) {
      reject(stderr);
      shelljs.exit(1);
    } else {
      resolve();
    }
  })
);

/**
 * Store app config data in JSON file
 */
ipcMain.on('create-app', async (event, title, url, appIcon, trayIconLarge, trayIconSmall) => {
  try {
    // Create app icon
    await saveAppIcon(appIcon, true);
    // Create tray icons
    await saveTrayIcon(trayIconLarge, true);
    await saveTrayIcon(trayIconSmall, false);
    // Create app config file
    await writeAppConfig({
      title,
      url,
      icon: 'assets/icons/tray.png'
    });
    // Create app's package.json
    const releaseDir = await createAppPackageFile(title);
    // Package app
    await packageApp();
    event.reply('create-app-response', releaseDir);
    shell.showItemInFolder(releaseDir);
  } catch (err) {
    console.error(`Failed to package app.`, err);
    event.reply('create-app-error', err);
  }
});