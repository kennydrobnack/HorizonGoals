'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {pathToFileURL} = require('node:url')
const {app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, nativeTheme, powerMonitor} = require('electron')
const core = require('./core')
const wallpaper = require('./wallpaper')
const {createStore, defaults, merge, safeBackground, IMAGE_EXTENSIONS} = require('./settings')

let store
let settings
let tray = null
let prefsWindow = null
let timer = null
let rendering = false

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'

function backgroundDir() {
    return path.join(app.getPath('userData'), 'custom-background')
}

function span() {
    const g = settings.general
    const end = core.parseLocal(g.endDate, g.endTime)
    const start = core.parseLocal(g.startDate, g.startTime) ?? Date.now()
    return {start, end}
}

function trayIcon(index) {
    // macOS tints template images itself. Windows doesn't, so pick black or white to match the taskbar.
    const set = isWindows && nativeTheme.shouldUseDarkColors ? 'hourglass-light' : 'hourglass'
    const icon = nativeImage.createFromPath(path.join(__dirname, `../assets/icons/${set}/icon-${index}.png`))
    if (isMac) icon.setTemplateImage(true)
    return icon
}

// The macOS menu bar can show text next to the icon. Windows tray icons can't, so the text goes in the tooltip.
function setTrayText(text) {
    if (isMac) tray.setTitle(text)
    else if (isWindows) tray.setToolTip(text ? `HorizonGoals: ${text}` : 'HorizonGoals')
}

function updateTray() {
    const {start, end} = span()
    const now = Date.now()
    const m = settings.menubar

    if (end === null) {
        tray.setImage(trayIcon(0))
        setTrayText('Set a goal')
        return
    }

    const pct = core.percentage(now, start, end)
    const parts = core.breakdown(now, end, m.textFormat)
    const wantsIcon = m.format === 'icon' || m.format.startsWith('iconPlus')

    // A Windows tray icon can't be blank, so text-only formats still show the hourglass there.
    tray.setImage(wantsIcon || isWindows ? trayIcon(core.iconIndex(pct)) : nativeImage.createEmpty())

    if (m.format === 'countdown' || m.format === 'iconPlusCountdown') {
        setTrayText(core.formatCountdown(parts, m.textFormat))
    } else if (m.format === 'percentage' || m.format === 'iconPlusPercentage') {
        setTrayText(`${pct}%`)
    } else {
        setTrayText(isWindows ? `${pct}%` : '')
    }
}

function backgroundImageUrl() {
    if (settings.wallpaper.backgroundType !== 'image') return null
    const file = safeBackground(backgroundDir(), settings.wallpaper.backgroundImage)
    return file ? pathToFileURL(file).href : null
}

async function updateWallpaper() {
    const {start, end} = span()
    if (settings.wallpaper.format === 'no' || end === null || rendering) return

    rendering = true
    try {
        const now = Date.now()
        await wallpaper.render({
            dir: path.join(app.getPath('userData'), 'wallpaper'),
            allScreens: settings.general.allScreens,
            state: {
                format: settings.wallpaper.format,
                style: settings.wallpaper,
                backgroundImageUrl: backgroundImageUrl(),
                time: core.breakdown(now, end, settings.wallpaper.textFormat),
                percentage: core.percentage(now, start, end)
            }
        })
    } catch (err) {
        console.error('Could not update wallpaper:', err.message)
    } finally {
        rendering = false
    }
}

function tick() {
    clearTimeout(timer)
    updateTray()
    updateWallpaper()
    // The menu bar needs minute resolution; the wallpaper follows the user's refresh interval.
    timer = setTimeout(tick, Math.max(60, settings.general.refreshEvery) * 1000)
}

function applyLogin() {
    const wanted = settings.general.startAtLogin
    if (app.getLoginItemSettings().openAtLogin !== wanted) app.setLoginItemSettings({openAtLogin: wanted})
}

function openPreferences() {
    if (prefsWindow) return prefsWindow.focus()

    prefsWindow = new BrowserWindow({
        width: 560,
        height: 720,
        resizable: false,
        fullscreenable: false,
        title: 'HorizonGoals Preferences',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false
        }
    })
    prefsWindow.loadFile(path.join(__dirname, '../ui/preferences.html'))
    prefsWindow.on('closed', () => { prefsWindow = null })
}

function validate(next) {
    const g = next.general
    const start = core.parseLocal(g.startDate, g.startTime)
    const end = core.parseLocal(g.endDate, g.endTime)
    if (!end) return 'Choose an end date for your goal.'
    if (start !== null && end <= start) return 'The end must be after the start.'
    return null
}

ipcMain.handle('settings:get', () => settings)

ipcMain.handle('background:choose', async () => {
    const {canceled, filePaths} = await dialog.showOpenDialog(prefsWindow, {
        title: 'Choose a background image',
        properties: ['openFile'],
        filters: [{name: 'Images', extensions: IMAGE_EXTENSIONS}]
    })
    if (canceled || filePaths.length === 0) return null

    const source = filePaths[0]
    const ext = path.extname(source).slice(1).toLowerCase()
    if (!IMAGE_EXTENSIONS.includes(ext)) return null

    // Keep our own copy so the wallpaper survives the original being moved or deleted.
    // A new name each time also keeps a stale cached image from being reused.
    const dir = backgroundDir()
    fs.mkdirSync(dir, {recursive: true})
    for (const old of fs.readdirSync(dir)) {
        if (old.startsWith('background-')) fs.rmSync(path.join(dir, old), {force: true})
    }
    const dest = path.join(dir, `background-${Date.now()}.${ext}`)
    fs.copyFileSync(source, dest)
    return dest
})

ipcMain.handle('settings:save', (event, next) => {
    const merged = merge(defaults, next)
    merged.wallpaper.backgroundImage = safeBackground(backgroundDir(), merged.wallpaper.backgroundImage)
    if (merged.wallpaper.backgroundType === 'image' && !merged.wallpaper.backgroundImage) {
        return {ok: false, error: 'Choose a background image, or switch the background back to a solid color.'}
    }
    const error = validate(merged)
    if (error) return {ok: false, error}
    settings = store.save(merged)
    applyLogin()
    tick()
    return {ok: true, settings}
})

ipcMain.handle('settings:reset', () => {
    settings = store.save(defaults)
    applyLogin()
    tick()
    return settings
})

// Only one copy should own the tray icon and the wallpaper.
if (!app.requestSingleInstanceLock()) app.quit()
else app.on('second-instance', openPreferences)

app.setAppUserModelId('com.horizongoals.app')

app.whenReady().then(() => {
    if (isMac) app.dock.hide()

    store = createStore(app.getPath('userData'))
    settings = store.load()

    tray = new Tray(trayIcon(0))
    tray.setContextMenu(Menu.buildFromTemplate([
        {label: 'Preferences…', click: openPreferences},
        {type: 'separator'},
        {label: 'Quit HorizonGoals', role: 'quit'}
    ]))
    tray.setToolTip('HorizonGoals')
    if (isWindows) tray.on('click', openPreferences)

    applyLogin()
    tick()
    if (!settings.general.endDate) openPreferences()

    powerMonitor.on('resume', () => setTimeout(tick, 2000))
    nativeTheme.on('updated', updateTray)
})

// Keep running in the menu bar when the preferences window closes.
app.on('window-all-closed', () => {})
