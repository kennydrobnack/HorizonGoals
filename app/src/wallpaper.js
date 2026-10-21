'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {execFile} = require('node:child_process')
const {BrowserWindow, screen} = require('electron')

function clearOld(dir) {
    for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('wallpaper-') && f.endsWith('.png')) fs.rmSync(path.join(dir, f), {force: true})
    }
}

function applyWallpaper(file, allScreens) {
    const target = allScreens ? 'every desktop' : 'desktop 1'
    // The path is passed through argv, never interpolated into the script.
    const script = [
        'on run argv',
        `tell application "System Events" to tell ${target} to set picture to (item 1 of argv)`,
        'end run'
    ].join('\n')

    return new Promise((resolve, reject) => {
        execFile('osascript', ['-e', script, file], err => (err ? reject(err) : resolve()))
    })
}

/**
 * Renders ui/wallpaper.html with the given state to an image and sets it as the desktop picture.
 * A new filename each time defeats macOS's wallpaper cache.
 */
async function render({dir, state, allScreens}) {
    fs.mkdirSync(dir, {recursive: true})
    const display = screen.getPrimaryDisplay()
    const {width, height} = display.size

    const win = new BrowserWindow({
        show: false,
        width,
        height,
        useContentSize: true,
        webPreferences: {contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false}
    })

    try {
        await win.loadFile(path.join(__dirname, '../ui/wallpaper.html'), {
            hash: encodeURIComponent(JSON.stringify(state))
        })
        // Wait for the background image, fonts and two frames so the capture never sees an unpainted page.
        await win.webContents.executeJavaScript(
            'Promise.all([window.horizonReady, document.fonts.ready]).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))))'
        )
        const image = await win.webContents.capturePage()
        const file = path.join(dir, `wallpaper-${Date.now()}.png`)
        clearOld(dir)
        fs.writeFileSync(file, image.toPNG())
        await applyWallpaper(file, allScreens)
        return file
    } finally {
        win.destroy()
    }
}

module.exports = {render}
