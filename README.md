## Install

`npm install vscode-electron-manager`

## About

> Currently In beta

Installs/spawns platform specific electron executable for your vscode extension to use and communicate with. You can use that executable to run your uncompiled JavaScript files implementing electron Api in vscode extension, without having to bundle them into electron for each platform.

Your extension and electron process can also seamlessly communicate via Node Ipc channels, see below.


## Use

```typescript

try {
    // install dir is the root folder in which electron is installed and extension has access
    const installDir = context.globalStorageUri.fsPath;
    const envVars = process.env;
    const electronManager = new ElectronManager(installDir, envVars);

    // returns { path, version } of electron installed
    const installed = await electronManager.getInstalled();

    // if its old you can use .upgrade() to upgrade it,

    if (!installed) {
        // installs the latest version of electron,
        await electronManager.install();

        // if anyone needs older version and wants to specify semver version like ^13.0.0, open an issue
    }

    // bundle electron-main process file with webpack, and specify its path
    const electronMainFile = path.resolve(
        __dirname,
        'electron-main.js'
    );

    // spawns electron child process
    // can also pass additional electron executable args in second argument
    const electron = await electronManager.start(electronMainFile);
    if (!electron) throw new Error('ensure electron installation');

    electron.on('exit', () => {
        // Handle spawn error
    });

    // communicate with electron main process via ipc
    // in electron-main.js use process.send() and process.on('message')
    electron.send('ping');

    electron.once('message', () => {
        // Handle message
    });
} catch (err) {
    // if you reach here, err variable might not give you much info
    // curently in beta it has some console.logs to give you an idea about error

    // open an issue about some specific case
}

```

## Setup

If you want to have electron Javascript files in same vscode project, you might need to save `electron` package as dev dependency in your package.json for Typescript to work.

Below is sample webpack config to bundle electron files sperately within your extension.

```javascript
// webpack.config.js
const commonConfig = {
    node: { __dirname: false },
    // common config and modules (like ts-loader)
} 
// Outputs main extension file, use node and vscode modules.
const extensionConfig = {
    ...commonConfig,
    target: 'node',
    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },
    externals: {
        vscode: 'commonjs vscode'
    },
}

// Outputs electron-main.js implementing electron Main process
// it needs to be passed to <ElectronManager>.start and then it manages BrowserWindows and renderer/preload processes.
const electronMainConfig = {
    ...commonConfig,
    target: 'electron-main',
    entry: './src/electron/main.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'electron-main.js'
    }
}

// Outputs electron-renderer.js implementing Electron Renderer process and calling that from html file loaded with Electrons <BrowserWindow>.loadFile

const electronRendererConfig = {
    ...commonConfig,
    target: 'electron-renderer',
    entry: './src/electron/renderer.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'electron-renderer.js'
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: "./src/electron/index.html"
        })
    ]
}

module.exports = [
    extensionConfig,
    electronMainConfig,
    electronRendererConfig
]

```