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

// Sets the wallpaper through IDesktopWallpaper, which (unlike SystemParametersInfo) can target one monitor.
// The image path arrives as a script argument, never interpolated into the script text.
const WINDOWS_SCRIPT = `
param([string]$Path, [string]$AllScreens)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct HgRect { public int Left, Top, Right, Bottom; }

[ComImport, Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IDesktopWallpaper {
    void SetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID, [MarshalAs(UnmanagedType.LPWStr)] string wallpaper);
    [return: MarshalAs(UnmanagedType.LPWStr)]
    string GetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID);
    [return: MarshalAs(UnmanagedType.LPWStr)]
    string GetMonitorDevicePathAt(uint monitorIndex);
    uint GetMonitorDevicePathCount();
    HgRect GetMonitorRECT([MarshalAs(UnmanagedType.LPWStr)] string monitorID);
    void SetBackgroundColor(uint color);
    uint GetBackgroundColor();
    void SetPosition(int position);
    int GetPosition();
}

[ComImport, Guid("C2CF3110-460E-4FC1-B9D0-8A1C0C9CC4BD")]
public class DesktopWallpaperClass { }
'@
$wallpaper = [IDesktopWallpaper](New-Object DesktopWallpaperClass)
$wallpaper.SetPosition(4) # DWPOS_FILL
if ($AllScreens -eq '1') {
    $wallpaper.SetWallpaper($null, $Path)
} else {
    # The primary monitor is the one whose top-left corner is the virtual desktop origin.
    $count = $wallpaper.GetMonitorDevicePathCount()
    for ($i = 0; $i -lt $count; $i++) {
        $id = $wallpaper.GetMonitorDevicePathAt($i)
        $rect = $wallpaper.GetMonitorRECT($id)
        if ($rect.Left -eq 0 -and $rect.Top -eq 0) { $wallpaper.SetWallpaper($id, $Path); break }
    }
}
`

function applyWallpaperWindows(file, allScreens, dir) {
    // PowerShell can't read inside app.asar, so the script is written next to the images.
    const script = path.join(dir, 'set-wallpaper.ps1')
    fs.writeFileSync(script, WINDOWS_SCRIPT)
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, file, allScreens ? '1' : '0']
    return new Promise((resolve, reject) => {
        execFile('powershell.exe', args, {windowsHide: true}, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve()))
    })
}

function applyWallpaper(file, allScreens, dir) {
    if (process.platform === 'win32') return applyWallpaperWindows(file, allScreens, dir)
    if (process.platform !== 'darwin') return Promise.reject(new Error(`Setting the wallpaper is not supported on ${process.platform}`))

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
 * A new filename each time defeats the OS wallpaper cache.
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
        await applyWallpaper(file, allScreens, dir)
        return file
    } finally {
        win.destroy()
    }
}

module.exports = {render}
