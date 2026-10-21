'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const core = require('../src/core')

const all = {years: true, months: true, days: true, hours: true, minutes: true}
const daysOnly = {years: false, months: false, days: true, hours: false, minutes: false}
const at = (y, m, d, hh = 0, mm = 0) => new Date(y, m - 1, d, hh, mm).getTime()

test('countdown is not capped at 24 hours', () => {
    const r = core.breakdown(at(2026, 1, 1), at(2026, 1, 11, 5, 30), {...all, years: false, months: false})
    assert.deepEqual(r, {years: 0, months: 0, days: 10, hours: 5, minutes: 30})
})

test('days-only rolls years and months into days', () => {
    const r = core.breakdown(at(2026, 1, 1), at(2028, 1, 1), daysOnly)
    assert.equal(r.days, 730)
})

test('years and months are calendar-aware', () => {
    const r = core.breakdown(at(2026, 1, 31), at(2028, 4, 30, 12, 15), all)
    assert.deepEqual(r, {years: 2, months: 3, days: 0, hours: 12, minutes: 15})
})

test('past deadline gives zeros', () => {
    assert.deepEqual(core.breakdown(at(2026, 5, 1), at(2026, 1, 1), all),
        {years: 0, months: 0, days: 0, hours: 0, minutes: 0})
})

test('percentage clamps and handles empty span', () => {
    assert.equal(core.percentage(at(2026, 1, 6), at(2026, 1, 1), at(2026, 1, 11)), 50)
    assert.equal(core.percentage(at(2025, 1, 1), at(2026, 1, 1), at(2026, 1, 11)), 0)
    assert.equal(core.percentage(at(2027, 1, 1), at(2026, 1, 1), at(2026, 1, 11)), 100)
    assert.equal(core.percentage(at(2026, 1, 1), at(2026, 1, 1), at(2026, 1, 1)), 100)
})

test('formatCountdown shows only enabled units', () => {
    const parts = {years: 1, months: 2, days: 3, hours: 4, minutes: 5}
    assert.equal(core.formatCountdown(parts, all), '1y 2mo 3d 4h 5m')
    assert.equal(core.formatCountdown(parts, daysOnly), '3d')
})

test('iconIndex maps percentage to 0-10', () => {
    assert.equal(core.iconIndex(0), 0)
    assert.equal(core.iconIndex(50), 5)
    assert.equal(core.iconIndex(99), 9)
    assert.equal(core.iconIndex(100), 10)
})

test('parseLocal defaults time to midnight and rejects empty date', () => {
    assert.equal(core.parseLocal('2026-03-04', ''), at(2026, 3, 4))
    assert.equal(core.parseLocal('', '10:00'), null)
})
