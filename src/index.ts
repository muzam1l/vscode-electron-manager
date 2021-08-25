import { ChildProcess, exec, spawn } from 'child_process'
import Downloader from 'nodejs-file-downloader'
import extract from 'extract-zip'
import semver from 'semver'
import fs from 'fs'
import os from 'os'
import path from 'path'
import rimraf from 'rimraf'
import fetch from 'node-fetch'
import { ProgressLocation, window } from 'vscode'

interface ResolvedExecutable {
    version: string
    path: string
}

export interface ElectronProcess extends ChildProcess {}

export class ElectronManager {
    readonly envVars: any
    private spawnedProcess?: ElectronProcess

    constructor(readonly installDir: string, envVars: any = {}) {
        delete envVars.ATOM_SHELL_INTERNAL_RUN_AS_NODE
        delete envVars.ELECTRON_RUN_AS_NODE
        this.envVars = envVars
    }

    // public fucntions

    async install() {
        try {
            const version = await this.getLatestRelease()
            return this.installElectronVersion(version)
        } catch (err) {
            window.showErrorMessage(
                'Cannot fetch resources, make sure you are connected to internet and try again.'
            )
            throw err
        }
    }
    async upgrade() {
        return this.install()
    }

    async getInstalled(): Promise<ResolvedExecutable | null> {
        const local = await this.resolveLocalElectron()

        if (local) return local

        const global = await this.resolveGlobalElectron()

        if (global) return global

        return null
    }

    async start(file?: string, args: string[] = []): Promise<ChildProcess | undefined> {
        const installed = await this.getInstalled()
        if (!installed) {
            return
        }
        if (file) args.unshift(file)

        const child = spawn(installed.path, args, {
            env: this.envVars,
            stdio: ['ipc'],
        })
        this.spawnedProcess = child
        return child
    }
    async stop() {
        this?.spawnedProcess?.kill()
    }

    async uninstall() {
        return new Promise(resolve => {
            const glob = path.join(this.installDir, 'electron*64')
            rimraf(glob, err => {
                resolve(err)
            })
        })
    }

    // private

    private async installElectronVersion(version: string): Promise<void> {
        const exec = await this.getInstalled()
        if (exec && semver.eq(exec.version, version)) {
            return
        }
        console.log('Electron version not installed')
        console.log('Cleaning installDir')

        await this.uninstall()

        console.log('Maybe cleaned')

        const { url, fileName } = this.getDownloadUrl(version)

        await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: 'Installing additional dependencies',
                cancellable: true,
            },
            async (progress, token) => {
                token.onCancellationRequested(() => {
                    downloader.cancel()
                })
                const downloader = new Downloader({
                    url: url,
                    fileName,
                    directory: this.installDir,
                    cloneFiles: false,
                    skipExistingFileName: true,
                    maxAttempts: 3,
                    onProgress: (percent, _, remaning) => {
                        const cents = parseFloat(percent)
                        const rems = remaning / (1024 * 1024)
                        let total: string | number = rems / ((100 - cents) / 100)
                        const loaded = (total - rems).toFixed(2)
                        total = total.toFixed(2)

                        progress.report({
                            message: `${loaded}/${total}MB`,
                        })
                    },
                })
                await downloader.download()

                progress.report({ message: 'Extracting...' })

                console.log('Downloaded ', fileName)
                console.log('Attempting to extract ', fileName)

                await this.extractFile(fileName)

                console.log('Extraction complete!, deleting zip (not awaiting)')

                this.deleteZip(fileName)
            }
        )
    }

    private resolveLocalElectron(): Promise<ResolvedExecutable | null> {
        return new Promise(resolve => {
            fs.readdir(this.installDir, async (err, files) => {
                if (err) resolve(null)

                // TODO Use better regex to detect 'electron-${version}-${os.platform()}-[x|arm]64'
                files = files.filter(f => f.startsWith('electron-') && f.endsWith('64'))

                // don't know what to do with multiple installations at this point
                // so just use the first file name for now
                const dirName = files[0]
                if (!dirName) resolve(null)

                const execPath = path.resolve(
                    this.installDir,
                    dirName,
                    this.getPlatformExecutable()
                )
                const version = await this.checkCommand(execPath)
                if (version) {
                    resolve({
                        version,
                        path: execPath,
                    })
                } else {
                    resolve(null)
                }
            })
        })
    }

    private async resolveGlobalElectron(): Promise<ResolvedExecutable | null> {
        const version = await this.checkCommand('electron')
        if (version)
            return {
                version,
                path: 'electron',
            }

        // try Application folder on mac
        const execPath = path.resolve('/Applications', this.getPlatformExecutable())

        const commandExists =
            os.platform() === 'darwin' && fs.existsSync(execPath) && fs.statSync(execPath).isFile()

        if (commandExists) {
            const version = await this.checkCommand(execPath)
            if (version) {
                return {
                    version,
                    path: execPath,
                }
            }
        }
        return null
    }

    private checkCommand(command = 'electron'): Promise<string | null> {
        return new Promise(resolve => {
            exec(`${command} --version`, { env: this.envVars }, (err, version) => {
                err ? resolve(null) : resolve(version.replace(/[\r\n]/, '').trim())
            })
        })
    }

    private async extractFile(fileName: string): Promise<void> {
        const source = path.resolve(this.installDir, fileName)
        const dir = source.slice(0, -4) // remove .zip at end
        // @ts-ignore
        process.noAsar = true
        await extract(source, { dir })
    }

    private deleteZip(fileName: string) {
        const target = path.resolve(this.installDir, fileName)
        fs.rm(target, err => {})
    }

    async getLatestRelease(): Promise<string> {
        // npm registry one gives correct result, but is poorly documented so can change
        // github releases api gives old version as lastes, used as fallback

        console.log('Fetching metadata from npm registry')
        try {
            const response = await fetch('https://registry.npmjs.org/electron/latest', {
                timeout: 5000,
            })

            const body = await response.json()
            if (typeof body.version === 'string') {
                return body.version
            } else throw Error('Cannot get version details')
        } catch (err) {
            if (err instanceof Error && err.message === 'Failed to fetch') {
                throw err
            }
            console.warn('Npm registry failed, trying github release api')

            const response = await fetch(
                'https://api.github.com/repos/electron/electron/releases/latest',
                { timeout: 10000 }
            )
            const body = await response.json()
            return body.tag_name
        }
    }

    private getDownloadUrl(version: string): { url: string; fileName: string } {
        const baseUrl = `https://github.com/electron/electron/releases/download/`
        const fileName = `electron-${version}-${os.platform()}-${os.arch()}.zip`
        const url = baseUrl + version + '/' + fileName
        return { url, fileName }
    }

    private getPlatformExecutable() {
        const platform = process.env.npm_config_platform || os.platform()
        switch (platform) {
            case 'mas':
            case 'darwin':
                return 'Electron.app/Contents/MacOS/Electron'
            case 'freebsd':
            case 'openbsd':
            case 'linux':
                return 'electron'
            case 'win32':
                return 'electron.exe'
            default:
                throw new Error('Electron builds are not available on platform: ' + platform)
        }
    }
}
