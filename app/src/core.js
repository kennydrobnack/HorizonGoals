'use strict'

const UNITS = ['years', 'months', 'days', 'hours', 'minutes']

const MS_MINUTE = 60 * 1000
const MS_HOUR = 60 * MS_MINUTE
const MS_DAY = 24 * MS_HOUR

function addYears(date, n) {
    return addMonths(date, n * 12)
}

// Adds calendar months, clamping the day (Jan 31 + 1 month = Feb 28/29).
function addMonths(date, n) {
    const d = new Date(date.getTime())
    const day = d.getDate()
    d.setDate(1)
    d.setMonth(d.getMonth() + n)
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(day, lastDay))
    return d
}

// Largest n >= 0 such that add(from, n) <= to.
function wholeSteps(from, to, add, estimate) {
    let n = Math.max(0, estimate)
    while (n > 0 && add(from, n) > to) n--
    while (add(from, n + 1) <= to) n++
    return n
}

/**
 * Time remaining between `now` and `deadline`, split into the enabled units.
 * Disabled units roll into the next smaller enabled one, so a countdown can
 * read "2y 3m 4d" or just "1,200 days". There is no 24-hour cap.
 */
function breakdown(now, deadline, enabled) {
    const result = {years: 0, months: 0, days: 0, hours: 0, minutes: 0}
    let from = new Date(now)
    const to = new Date(deadline)
    if (!(to > from)) return result

    if (enabled.years) {
        result.years = wholeSteps(from, to, addYears, Math.floor((to - from) / (365 * MS_DAY)))
        from = addYears(from, result.years)
    }

    if (enabled.months) {
        result.months = wholeSteps(from, to, addMonths, Math.floor((to - from) / (31 * MS_DAY)))
        from = addMonths(from, result.months)
    }

    let rest = to - from

    if (enabled.days) {
        result.days = Math.floor(rest / MS_DAY)
        rest -= result.days * MS_DAY
    }

    if (enabled.hours) {
        result.hours = Math.floor(rest / MS_HOUR)
        rest -= result.hours * MS_HOUR
    }

    if (enabled.minutes) {
        result.minutes = Math.floor(rest / MS_MINUTE)
    }

    return result
}

/** Percentage (0-100) of the start..end span that has elapsed. */
function percentage(now, start, end) {
    const span = end - start
    if (!(span > 0)) return now >= end ? 100 : 0
    const done = Math.floor(((now - start) * 100) / span)
    return Math.min(100, Math.max(0, done))
}

/** Menu bar title, e.g. "2y 3m 4d 5h 6m". Month is "mo" to avoid clashing with minutes. */
function formatCountdown(parts, enabled) {
    const labels = {years: 'y', months: 'mo', days: 'd', hours: 'h', minutes: 'm'}
    return UNITS.filter(u => enabled[u]).map(u => `${parts[u]}${labels[u]}`).join(' ')
}

/** Hourglass icon index 0-10 for a percentage. */
function iconIndex(pct) {
    if (pct >= 100) return 10
    if (pct <= 5) return 0
    return Math.min(9, Math.ceil(pct / 10))
}

// Combines a date ("YYYY-MM-DD") and optional time ("HH:MM") in local time.
function parseLocal(date, time) {
    if (!date) return null
    const [y, m, d] = date.split('-').map(Number)
    const [hh, mm] = (time || '00:00').split(':').map(Number)
    const out = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0)
    return Number.isNaN(out.getTime()) ? null : out.getTime()
}

module.exports = {UNITS, breakdown, percentage, formatCountdown, iconIndex, parseLocal, addMonths}
