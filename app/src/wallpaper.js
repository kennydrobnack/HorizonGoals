'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {pathToFileURL} = require('node:url')
const {execFile} = require('node:child_process')
const {BrowserWindow, screen} = require('electron')

function clearOld(dir) {
    for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('wallpaper-') && f.endsWith('.png')) fs.rmSync(path.join(dir, f), {force: true})
    }
}

function run(cmd, args) {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, (err, stdout) => (err ? reject(err) : resolve(stdout)))
    })
}

function applyMac(file, allScreens) {
    const target = allScreens ? 'every desktop' : 'desktop 1'
    // The path is passed through argv, never interpolated into the script.
    const script = [
        'on run argv',
        `tell application "System Events" to tell ${target} to set picture to (item 1 of argv)`,
        'end run'
    ].join('\n')
    return run('osascript', ['-e', script, file])
}

// COSMIC has no CLI. cosmic-bg watches its config file and reloads when it changes.
// The file is RON, so only the `source` entry is rewritten and the user's other options are kept.
async function applyCosmic(file) {
    const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
    const dir = path.join(base, 'cosmic', 'com.system76.CosmicBackground', 'v1')
    const entry = path.join(dir, 'all')
    const ron = JSON.stringify(file) // RON strings escape the same way for ordinary paths
    let text
    try {
        text = fs.readFileSync(entry, 'utf8')
    } catch {
        text = `(\n    output: "all",\n    source: Path(""),\n    filter_by_theme: false,\n    rotation_frequency: 300,\n    filter_method: Lanczos,\n    scaling_mode: Zoom,\n    sampling_method: Alphanumeric,\n)`
    }
    text = text.replace(/source:\s*Path\((?:"(?:[^"\\]|\\.)*")\)/, () => `source: Path(${ron})`)
    // Not a plain Path (e.g. a color or a slideshow directory): replace the whole source value.
    if (!text.includes(`Path(${ron})`)) text = text.replace(/source:\s*[A-Za-z]+\([^\n]*\),/, () => `source: Path(${ron}),`)

    fs.mkdirSync(dir, {recursive: true})
    // Wallpaper stays identical on every display, and the slideshow filter must not recolor it.
    fs.writeFileSync(path.join(dir, 'same-on-all'), 'true')
    fs.writeFileSync(entry, text.replace(/filter_by_theme:\s*true/, 'filter_by_theme: false'))
}

async function applyGnome(file, schema) {
    const uri = pathToFileURL(file).href
    await run('gsettings', ['set', schema, 'picture-options', 'zoom'])
    await run('gsettings', ['set', schema, 'picture-uri', uri])
    // GNOME 42+ has a separate key for the dark style; older versions lack it.
    await run('gsettings', ['set', schema, 'picture-uri-dark', uri]).catch(() => {})
}

async function applyKde(file) {
    await run('plasma-apply-wallpaperimage', [file])
}

async function applyXfce(file) {
    const props = (await run('xfconf-query', ['-c', 'xfce4-desktop', '-l'])).split('\n').filter(p => p.endsWith('/last-image'))
    if (props.length === 0) throw new Error('no XFCE desktop properties found')
    for (const prop of props) await run('xfconf-query', ['-c', 'xfce4-desktop', '-p', prop, '-s', file])
}

async function applyGeneric(file) {
    if (process.env.SWAYSOCK) return run('swaymsg', ['output', '*', 'bg', file, 'fill'])
    await run('feh', ['--bg-fill', file])
}

function applyWallpaper(file, allScreens) {
    if (process.platform === 'darwin') return applyMac(file, allScreens)
    if (process.platform !== 'linux') return Promise.reject(new Error(`Wallpaper is not supported on ${process.platform}`))

    const desktops = (process.env.XDG_CURRENT_DESKTOP || '').toLowerCase().split(':')
    const is = (...names) => names.some(n => desktops.includes(n))

    if (is('cosmic')) return applyCosmic(file)
    if (is('kde')) return applyKde(file)
    if (is('xfce')) return applyXfce(file)
    if (is('x-cinnamon')) return applyGnome(file, 'org.cinnamon.desktop.background')
    if (is('gnome', 'unity', 'budgie', 'pantheon', 'ubuntu', 'mate')) {
        return applyGnome(file, is('mate') ? 'org.mate.background' : 'org.gnome.desktop.background')
    }
    return applyGeneric(file)
}

/**
 * Renders ui/wallpaper.html with the given state to an image and sets it as the desktop picture.
 * A new filename each time defeats the desktop's wallpaper cache.
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
