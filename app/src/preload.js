'use strict'

const {contextBridge, ipcRenderer} = require('electron')

contextBridge.exposeInMainWorld('horizonGoals', {
    getSettings: () => ipcRenderer.invoke('settings:get'),
    chooseBackground: () => ipcRenderer.invoke('background:choose'),
    saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
    resetSettings: () => ipcRenderer.invoke('settings:reset')
})
