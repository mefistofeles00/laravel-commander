import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerAppIpc } from './ipc/app'
import { registerProjectsIpc } from './ipc/projects'
import { registerPhpIpc } from './ipc/php'
import { registerArtisanIpc } from './ipc/artisan'
import { registerEnvIpc } from './ipc/env'
import { registerDoctorIpc } from './ipc/doctor'
import { registerDevIpc } from './ipc/dev'
import { ProjectManager } from './services/ProjectManager'
import { PhpEnvironment } from './services/PhpEnvironment'
import { CommandRunner } from './services/CommandRunner'
import { EnvFileService } from './services/EnvFileService'
import { ProjectDoctor } from './services/ProjectDoctor'
import { DevProcessManager } from './services/DevProcessManager'
import { store } from './services/storage'

const projectManager = new ProjectManager()
const phpEnvironment = new PhpEnvironment(() => store.get('phpPathOverride'))
const commandRunner = new CommandRunner()
const envFileService = new EnvFileService()
const projectDoctor = new ProjectDoctor(phpEnvironment, envFileService)
const devProcessManager = new DevProcessManager(phpEnvironment, commandRunner)

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1b1815',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // electron-vite builds the preload as ESM, which sandboxed preloads
      // don't support. See https://electron-vite.org/guide/dev#sandbox
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.laravelcommander.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerAppIpc()
  registerProjectsIpc(projectManager)
  registerPhpIpc(phpEnvironment)
  registerArtisanIpc(projectManager, phpEnvironment, commandRunner)
  registerEnvIpc(projectManager, envFileService)
  registerDoctorIpc(projectManager, projectDoctor)
  registerDevIpc(projectManager, devProcessManager)

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// No artisan/composer process may outlive the app.
app.on('before-quit', () => {
  commandRunner.killAll()
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
