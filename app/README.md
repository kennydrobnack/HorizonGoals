# HorizonGoals

A macOS menu bar / Windows system tray app that counts down to a goal, with an optional live countdown wallpaper.
A countdown app inspired by Finito 1.2.1 (CC0-1.0, original by finito-app.com), rebuilt from its observed behavior. It is a separate app and keeps its own data.

## Features
- Set a **start and end date/time** for a goal.
- **No 24-hour limit.** The countdown can show years, months, days, hours and minutes, in any combination.
  Disabled units roll into the next smaller one (e.g. days only: `1,204d`). Years and months are calendar-aware.
- **Menu bar:** icon (hourglass fills as time passes), countdown, percentage, or icon plus either.
- **Wallpaper:** countdown, progress bar or percentage, re-rendered every 1 min to 1 day. Custom colors and size.
  Main screen or all screens.
- Open at login.

## Run
    npm install
    npm start        # then use the hourglass icon in the menu bar -> Preferences
    npm test         # countdown math

The first launch opens Preferences. Closing the window keeps HorizonGoals running in the menu bar; quit from its menu.

## Build for Windows
Run on Windows with Node.js and the [Windows 10/11 SDK](https://developer.microsoft.com/windows/downloads/windows-sdk/) (for `makeappx` and `signtool`):

    npm run build:win

Output in `dist\`:
- `HorizonGoals-<version>-portable-x64.exe`: a single exe, no install needed.
- `HorizonGoals-<version>-x64.msix`: the installer.

The MSIX must be signed. Without `-CertPath` the script makes a self-signed test certificate (`dist\HorizonGoals-dev.cer`). To install such a build, trust it once from an administrator PowerShell, then double-click the `.msix`:

    Import-Certificate -FilePath dist\HorizonGoals-dev.cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople

For real distribution, sign with your own certificate. Its subject must equal `-Publisher`:

    npm run build:win -- -CertPath C:\keys\mycert.pfx -CertPassword secret -Publisher "CN=My Company"

Other flags: `-SkipTests`, `-SkipMsix`. The portable exe is unsigned, so SmartScreen may warn on first run.

## Notes
- Settings are stored in `~/Library/Application Support/HorizonGoals/settings.json` (macOS) or `%APPDATA%\HorizonGoals\settings.json` (Windows; inside the package's private store when installed from the MSIX).
- macOS: setting the wallpaper uses AppleScript via System Events. macOS asks for Automation permission the first time.
- Windows: the wallpaper is set through the `IDesktopWallpaper` COM API from a PowerShell script. Windows tray icons can't show text, so the countdown or percentage appears in the tray icon's tooltip, and the icon always shows. Left-click the icon to open Preferences.
- Windows: "Open at login" is not wired up for the MSIX build (it would need a startup task in the manifest); it works in the portable exe.
- Not yet ported from the original: custom background images and the alternate countdown/progress templates.
