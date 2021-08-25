## Install

`npm install vscode-electron-manager`

> Currently In beta, installs/spawns platform specific electron executable for your vscode extension to use and communicate with.


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