# Web Tray
This is an Electron app that can be used to create basic menu bar / system tray applications
containing a specific web page per app.  
Simply run, fill out your intended tray app's details, and click "Create app". This will generate
a packaged app for use on your system.

# A note on running
This app integrates `electron-builder` to dynamically package apps based on a template.  
It seems that the dependency of `electron-builder` on `electron` is not resolved by copying `electron` along with it in the app template's `node_modules` folder.  
Run this app from the command line to prevent a hard crash when hitting `Create app`.
