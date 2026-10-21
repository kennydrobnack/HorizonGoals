# Finito.app static analysis report

Static analysis of `/Applications/Finito.app` using REA (`analyze_javascript_application`, detail `summary`). Nothing was executed; all findings are static observations.

## Target

| Field | Value |
|---|---|
| App | Finito 1.2.1 (`CFBundleVersion` 1.2.1) |
| Bundle ID | `com.finito-app.app` |
| Type | Electron (Electron Framework, Squirrel, Mantle, ReactiveCocoa) |
| Analyzed artifact | `Contents/Resources/app.asar` (1.4 MB) |
| asar SHA-256 | `056147ae3aa998d43cd873d0add7efc62711edf54c174212d96cd480f2d23636` |
| Copyright | 2019 finito-app.com |
| Min macOS | 10.9.0 |

## Evidence

- Summary view: `ev_0ccdf9a3ba41dab2e5252a43f60b7c4590a7889d8e22e1d4bf3a0078df7fe3ea`
- Parent analysis: `ev_f5cf9d848a9d8eedd2276cfa2c8ff8f828352d87a61a340301a059c1f6caf250`
- Exported bundle: `reports/application.evidence.json` (52.9 MB, 2 records)

## Findings

### Observations

- 151 relevant files; 98 JavaScript files parsed, 0 parse failures, 0 nested asars.
- 2 browser windows.
- No preload entrypoints, no context-bridge APIs, no explicit `webPreferences`.
- No utility processes and no native addon bindings.
- IPC: 9 operations over 6 literal channels, no dynamic channels. 3 renderer sends are each paired with 3 main handlers. No sender validation observed.
- `Info.plist` sets `NSAllowsArbitraryLoads = true`, with insecure-HTTP exceptions for `localhost` and `127.0.0.1`.
- Static extraction found 32 child-process relations, 2 request relations and 6 configuration relations (retained relation counts, not confirmed runtime behavior).

### Inferences / caveats

- Absence of explicit `webPreferences` does not establish which defaults apply at runtime; registration and enforcement are unproven by static analysis.
- Absence of sender validation in the extracted facts is not proof none exists (dynamic or unresolved code is not covered).

## Coverage gaps

- Overall coverage is **partial** (application and semantic graphs).
- Worker heap exhausted on `node_modules/node-fetch/lib/index.js`, `index.es.js` and `index.mjs`.
- Inline JavaScript not analyzed in: `preferences/index.html` (line 486) and countdown templates `alarm`, `clever`, `clock`, `default`, `future`, `minimalist`, `typewriter` (`templates/countdown/*.html`). Endpoints, storage and imports in those scripts are absent from the evidence.
- 10,167 semantic-graph unknowns and 23 application-graph unknowns remain. A missing finding does not mean the behavior is absent.

## Process notes

- The `rea` CLI is not installed; REA MCP tools were used instead.
- `/reports/application.evidence.json` (filesystem root) does not exist, so output was written to this project's `reports/` folder.

## Suggested follow-ups

1. Trace the 3 IPC channel pairs and their main-process handlers.
2. Inspect the `preferences/index.html` inline script.
3. Check packaged Electron fuses (`inspect_electron_fuses`).
4. Review the 32 child-process relations.
