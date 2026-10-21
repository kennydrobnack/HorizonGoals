'use strict'

const fs = require('node:fs')
const path = require('node:path')

const defaults = {
    general: {
        startDate: null,
        startTime: '00:00',
        endDate: null,
        endTime: '00:00',
        refreshEvery: 300,
        startAtLogin: false,
        allScreens: false
    },
    wallpaper: {
        format: 'countdown', // countdown | progressbar | percentage | no
        textFormat: {years: false, months: false, days: true, hours: true, minutes: true},
        backgroundType: 'solid', // solid | image
        backgroundImage: null, // absolute path inside the app's custom-background folder
        backgroundColor: '#1C3D5A',
        textColor: '#BCDEFA',
        size: 'normal' // small | normal | big
    },
    menubar: {
        format: 'iconPlusCountdown', // icon | countdown | percentage | iconPlusCountdown | iconPlusPercentage
        textFormat: {years: false, months: false, days: true, hours: true, minutes: false}
    }
}

function merge(base, extra) {
    const out = {}
    for (const key of Object.keys(base)) {
        const b = base[key]
        const e = extra && extra[key]
        out[key] = b && typeof b === 'object' ? merge(b, e) : (e === undefined ? b : e)
    }
    return out
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif']

// Only accept a background image that lives directly inside `dir` (the app's own copy).
function safeBackground(dir, file) {
    if (typeof file !== 'string' || file === '') return null
    const resolved = path.resolve(file)
    if (path.dirname(resolved) !== path.resolve(dir)) return null
    if (!IMAGE_EXTENSIONS.includes(path.extname(resolved).slice(1).toLowerCase())) return null
    return fs.existsSync(resolved) ? resolved : null
}

function createStore(dir) {
    const file = path.join(dir, 'settings.json')

    function load() {
        try {
            return merge(defaults, JSON.parse(fs.readFileSync(file, 'utf8')))
        } catch {
            return merge(defaults, {})
        }
    }

    function save(next) {
        const clean = merge(defaults, next)
        fs.mkdirSync(dir, {recursive: true})
        fs.writeFileSync(file, JSON.stringify(clean, null, 2))
        return clean
    }

    return {load, save}
}

module.exports = {defaults, createStore, merge, safeBackground, IMAGE_EXTENSIONS}
