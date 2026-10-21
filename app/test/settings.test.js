'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {defaults, merge, safeBackground} = require('../src/settings')

function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'horizongoals-test-'))
}

test('safeBackground accepts an image inside the folder', () => {
    const dir = tempDir()
    const file = path.join(dir, 'background-1.png')
    fs.writeFileSync(file, 'x')
    assert.equal(safeBackground(dir, file), file)
})

test('safeBackground rejects files outside the folder, including via ..', () => {
    const dir = tempDir()
    const outside = path.join(tempDir(), 'secret.png')
    fs.writeFileSync(outside, 'x')
    assert.equal(safeBackground(dir, outside), null)
    assert.equal(safeBackground(dir, path.join(dir, '..', path.basename(path.dirname(outside)), 'secret.png')), null)
})

test('safeBackground rejects non-images, missing files and bad input', () => {
    const dir = tempDir()
    const text = path.join(dir, 'notes.txt')
    fs.writeFileSync(text, 'x')
    assert.equal(safeBackground(dir, text), null)
    assert.equal(safeBackground(dir, path.join(dir, 'missing.png')), null)
    assert.equal(safeBackground(dir, null), null)
    assert.equal(safeBackground(dir, {}), null)
    assert.equal(safeBackground(dir, ''), null)
})

test('merge fills missing settings from defaults and keeps saved values', () => {
    const merged = merge(defaults, {wallpaper: {backgroundType: 'image'}, general: {endDate: '2030-01-01'}})
    assert.equal(merged.wallpaper.backgroundType, 'image')
    assert.equal(merged.wallpaper.backgroundImage, null)
    assert.equal(merged.general.endDate, '2030-01-01')
    assert.equal(merged.general.refreshEvery, defaults.general.refreshEvery)
})
