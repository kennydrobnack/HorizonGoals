'use strict'

const UNITS = ['years', 'months', 'days', 'hours', 'minutes']
const $ = id => document.getElementById(id)

for (const group of ['menubarUnits', 'wallpaperUnits']) {
    for (const unit of UNITS) {
        const label = document.createElement('label')
        const box = document.createElement('input')
        box.type = 'checkbox'
        box.id = `${group}-${unit}`
        label.append(box, unit)
        $(group).append(label)
    }
}

function fill(s) {
    $('startDate').value = s.general.startDate || ''
    $('startTime').value = s.general.startTime || ''
    $('endDate').value = s.general.endDate || ''
    $('endTime').value = s.general.endTime || ''
    $('refreshEvery').value = String(s.general.refreshEvery)
    $('allScreens').checked = s.general.allScreens
    $('startAtLogin').checked = s.general.startAtLogin
    $('menubarFormat').value = s.menubar.format
    $('wallpaperFormat').value = s.wallpaper.format
    $('backgroundColor').value = s.wallpaper.backgroundColor
    $('textColor').value = s.wallpaper.textColor
    $('size').value = s.wallpaper.size
    for (const unit of UNITS) {
        $(`menubarUnits-${unit}`).checked = s.menubar.textFormat[unit]
        $(`wallpaperUnits-${unit}`).checked = s.wallpaper.textFormat[unit]
    }
}

function units(group) {
    return Object.fromEntries(UNITS.map(u => [u, $(`${group}-${u}`).checked]))
}

function collect() {
    return {
        general: {
            startDate: $('startDate').value || null,
            startTime: $('startTime').value || '00:00',
            endDate: $('endDate').value || null,
            endTime: $('endTime').value || '00:00',
            refreshEvery: Number($('refreshEvery').value),
            allScreens: $('allScreens').checked,
            startAtLogin: $('startAtLogin').checked
        },
        menubar: {format: $('menubarFormat').value, textFormat: units('menubarUnits')},
        wallpaper: {
            format: $('wallpaperFormat').value,
            textFormat: units('wallpaperUnits'),
            backgroundColor: $('backgroundColor').value,
            textColor: $('textColor').value,
            size: $('size').value
        }
    }
}

function show(text, kind) {
    $('message').textContent = text
    $('message').className = kind
}

$('save').addEventListener('click', async () => {
    const result = await window.horizonGoals.saveSettings(collect())
    if (result.ok) show('Saved.', 'ok')
    else show(result.error, 'error')
})

$('reset').addEventListener('click', async () => {
    fill(await window.horizonGoals.resetSettings())
    show('Settings reset.', 'ok')
})

window.horizonGoals.getSettings().then(fill)
