'use strict'

const state = JSON.parse(decodeURIComponent(location.hash.slice(1)))
const {style, time, percentage, format} = state

const scale = {small: 0.65, normal: 1, big: 1.5}[style.size] || 1
const base = Math.round(window.innerHeight / 10 * scale)

document.body.style.background = style.backgroundColor
document.body.style.color = style.textColor
document.body.style.fontSize = base + 'px'

const root = document.getElementById('root')

function el(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
}

if (format === 'countdown') {
    const row = el('div', 'row')
    for (const unit of ['years', 'months', 'days', 'hours', 'minutes']) {
        if (!style.textFormat[unit]) continue
        const box = el('div', 'unit')
        box.append(el('div', 'num', time[unit].toLocaleString()))
        const label = el('div', 'label', unit.toUpperCase())
        label.style.fontSize = '0.2em'
        box.append(label)
        row.append(box)
    }
    root.append(row)
} else if (format === 'progressbar') {
    const bar = el('div', 'bar')
    const fill = el('div', 'fill')
    fill.style.width = percentage + '%'
    bar.append(fill)
    root.append(bar, el('div', 'caption', percentage + '%'))
} else {
    root.append(el('div', 'num', percentage + '%'))
}
