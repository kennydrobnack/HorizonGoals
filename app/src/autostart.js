'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {app} = require('electron')

function file() {
    const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
    return path.join(base, 'autostart', 'horizongoals.desktop')
}

function quote(arg) {
    return `"${arg.replace(/(["`$\\])/g, '\\$1')}"`
}

// Packaged builds run the executable; during development it is electron plus the app folder.
function command() {
    const args = app.isPackaged ? [process.execPath] : [process.execPath, app.getAppPath()]
    return args.map(quote).join(' ')
}

/** Adds or removes the XDG autostart entry that starts HorizonGoals at login. */
function set(enabled) {
    const target = file()
    if (!enabled) return fs.rmSync(target, {force: true})

    fs.mkdirSync(path.dirname(target), {recursive: true})
    fs.writeFileSync(target, [
        '[Desktop Entry]',
        'Type=Application',
        'Name=HorizonGoals',
        'Comment=Countdown to your goal',
        `Exec=${command()}`,
        'X-GNOME-Autostart-enabled=true',
        ''
    ].join('\n'))
}

module.exports = {set, file}
