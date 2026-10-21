'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {pathToFileURL} = require('node:url')
const {app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, nativeTheme, powerMonitor} = require('electron')
const core = require('./core')
const wallpaper = require('./wallpaper')
const autostart = require('./autostart')
const {createStore, defaults, merge, safeBackground, IMAGE_EXTENSIONS} = require('./settings')

let store
let settings
let tray = null
let prefsWindow = null
let timer = null
let rendering = false

function backgroundDir() {
    return path.join(app.getPath('userData'), 'custom-background')
}

function span() {
    const g = settings.general
    const end = core.parseLocal(g.endDate, g.endTime)
    const start = core.parseLocal(g.startDate, g.startTime) ?? Date.now()
    return {start, end}
}

const IS_MAC = process.platform === 'darwin'

function trayIcon(index) {
    const icon = nativeImage.createFromPath(path.join(__dirname, `../assets/icons/hourglass/icon-${index}.png`))
    if (IS_MAC) {
        icon.setTemplateImage(true)
        return icon
    }
    // Only macOS recolors template images. Elsewhere, tint the black glyph to suit the panel theme.
    return tint(icon, nativeTheme.shouldUseDarkColors ? 255 : 0)
}

function tint(icon, channel) {
    const {width, height} = icon.getSize()
    const bitmap = Buffer.from(icon.toBitmap()) // BGRA
    for (let i = 0; i < bitmap.length; i += 4) {
        bitmap[i] = bitmap[i + 1] = bitmap[i + 2] = channel
    }
    return nativeImage.createFromBitmap(bitmap, {width, height})
}

// macOS shows text beside the icon. Other platforms have no such API, so the text goes
// into the tooltip and the top (disabled) entry of the tray menu.
function showTitle(text) {
    if (IS_MAC) return tray.setTitle(text)
    tray.setToolTip(text || 'HorizonGoals')
    tray.setContextMenu(buildMenu(text))
}

function buildMenu(label) {
    const items = [
        {label: 'Preferences…', click: openPreferences},
        {type: 'separator'},
        {label: 'Quit HorizonGoals', role: 'quit'}
    ]
    if (!IS_MAC && label) items.unshift({label, enabled: false}, {type: 'separator'})
    return Menu.buildFromTemplate(items)
}

function updateTray() {
    const {start, end} = span()
    const now = Date.now()
    const m = settings.menubar

    if (end === null) {
        tray.setImage(trayIcon(0))
        showTitle('Set a goal')
        return
    }

    const pct = core.percentage(now, start, end)
    const parts = core.breakdown(now, end, m.textFormat)
    const wantsIcon = !IS_MAC || m.format === 'icon' || m.format.startsWith('iconPlus')

    tray.setImage(wantsIcon ? trayIcon(core.iconIndex(pct)) : nativeImage.createEmpty())

    if (m.format === 'countdown' || m.format === 'iconPlusCountdown') {
        showTitle(core.formatCountdown(parts, m.textFormat))
    } else if (m.format === 'percentage' || m.format === 'iconPlusPercentage') {
        showTitle(`${pct}%`)
    } else {
        showTitle(IS_MAC ? '' : `${pct}%`)
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
    // Electron's login item API does nothing on Linux, where autostart is a .desktop file.
    if (process.platform === 'linux') return autostart.set(wanted)
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

app.whenReady().then(() => {
    if (IS_MAC) app.dock.hide()

    store = createStore(app.getPath('userData'))
    settings = store.load()

    tray = new Tray(trayIcon(0))
    tray.setContextMenu(buildMenu())
    nativeTheme.on('updated', updateTray)

    applyLogin()
    tick()
    if (!settings.general.endDate) openPreferences()

    powerMonitor.on('resume', () => setTimeout(tick, 2000))
})

// Keep running in the menu bar when the preferences window closes.
app.on('window-all-closed', () => {})
