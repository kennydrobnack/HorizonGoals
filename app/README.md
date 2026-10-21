# HorizonGoals

A macOS menu bar app that counts down to a goal, with an optional live countdown wallpaper.
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

## Notes
- Settings are stored in `~/Library/Application Support/HorizonGoals/settings.json`.
- Setting the wallpaper uses AppleScript via System Events. macOS asks for Automation permission the first time.
- Not yet ported from the original: custom background images and the alternate countdown/progress templates.
