'use strict'

const path = require('node:path')
const {app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, powerMonitor} = require('electron')
const core = require('./core')
const wallpaper = require('./wallpaper')
const {createStore, defaults} = require('./settings')

let store
let settings
let tray = null
let prefsWindow = null
let timer = null
let rendering = false

function span() {
    const g = settings.general
    const end = core.parseLocal(g.endDate, g.endTime)
    const start = core.parseLocal(g.startDate, g.startTime) ?? Date.now()
    return {start, end}
}

function trayIcon(index) {
    const icon = nativeImage.createFromPath(path.join(__dirname, `../assets/icons/hourglass/icon-${index}.png`))
    icon.setTemplateImage(true)
    return icon
}

function updateTray() {
    const {start, end} = span()
    const now = Date.now()
    const m = settings.menubar

    if (end === null) {
        tray.setImage(trayIcon(0))
        tray.setTitle('Set a goal')
        return
    }

    const pct = core.percentage(now, start, end)
    const parts = core.breakdown(now, end, m.textFormat)
    const wantsIcon = m.format === 'icon' || m.format.startsWith('iconPlus')

    tray.setImage(wantsIcon ? trayIcon(core.iconIndex(pct)) : nativeImage.createEmpty())

    if (m.format === 'countdown' || m.format === 'iconPlusCountdown') {
        tray.setTitle(core.formatCountdown(parts, m.textFormat))
    } else if (m.format === 'percentage' || m.format === 'iconPlusPercentage') {
        tray.setTitle(`${pct}%`)
    } else {
        tray.setTitle('')
    }
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

ipcMain.handle('settings:save', (event, next) => {
    const merged = store.save(next)
    const error = validate(merged)
    if (error) return {ok: false, error}
    settings = merged
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
    if (process.platform === 'darwin') app.dock.hide()

    store = createStore(app.getPath('userData'))
    settings = store.load()

    tray = new Tray(trayIcon(0))
    tray.setContextMenu(Menu.buildFromTemplate([
        {label: 'Preferences…', click: openPreferences},
        {type: 'separator'},
        {label: 'Quit HorizonGoals', role: 'quit'}
    ]))

    applyLogin()
    tick()
    if (!settings.general.endDate) openPreferences()

    powerMonitor.on('resume', () => setTimeout(tick, 2000))
})

// Keep running in the menu bar when the preferences window closes.
app.on('window-all-closed', () => {})
