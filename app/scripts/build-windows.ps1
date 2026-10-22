<#
.SYNOPSIS
  Builds HorizonGoals for Windows: a single-file portable .exe and an .msix installer.

.DESCRIPTION
  Run on Windows (the MSIX tools come with the Windows 10/11 SDK). Output lands in app\dist:
    HorizonGoals-<version>-portable-x64.exe   plain exe, no install
    HorizonGoals-<version>-x64.msix           installer
    HorizonGoals-dev.cer                      only when the MSIX was signed with a generated test certificate

  Without -CertPath the MSIX is signed with a self-signed certificate. Windows only installs it after that
  certificate is trusted (see the README). For distribution, pass a real code-signing .pfx whose subject
  matches -Publisher.

.EXAMPLE
  npm run build:win
  npm run build:win -- -CertPath C:\keys\mycert.pfx -CertPassword secret -Publisher "CN=My Company"
#>
param(
    [string]$Publisher = 'CN=HorizonGoals',
    [string]$PublisherDisplayName = 'HorizonGoals',
    [string]$CertPath,
    [string]$CertPassword,
    [switch]$SkipTests,
    [switch]$SkipMsix
)

$ErrorActionPreference = 'Stop'
$appDir = Split-Path -Parent $PSScriptRoot
Set-Location $appDir

function Invoke-Native([string]$Exe, [string[]]$Arguments) {
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Exe failed with exit code $LASTEXITCODE" }
}

function Find-SdkTool([string]$Name) {
    $found = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter $Name -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '\\x64\\' } |
        Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $found) { throw "$Name not found. Install the Windows 10/11 SDK (https://developer.microsoft.com/windows/downloads/windows-sdk/)." }
    $found.FullName
}

$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$version = $pkg.version
$dist = Join-Path $appDir 'dist'

Write-Host '==> Installing dependencies'
Invoke-Native npm.cmd @('ci')

if (-not $SkipTests) {
    Write-Host '==> Running tests'
    Invoke-Native npm.cmd @('test')
}

Remove-Item $dist -Recurse -Force -ErrorAction SilentlyContinue

Write-Host '==> Building the portable exe (also leaves dist\win-unpacked for the MSIX)'
Invoke-Native npx.cmd @('electron-builder', '--win', 'portable', '--x64', '--publish', 'never')

if ($SkipMsix) { Write-Host "Done. See $dist"; return }

Write-Host '==> Building the MSIX'
$makeappx = Find-SdkTool 'makeappx.exe'
$signtool = Find-SdkTool 'signtool.exe'

# MSIX versions are four numbers; the last must be 0 for Store submissions.
$msixVersion = ($version -replace '[-+].*$', '').Split('.') + @('0', '0', '0', '0') | Select-Object -First 3
$msixVersion = ($msixVersion -join '.') + '.0'

$stage = Join-Path $dist 'msix-stage'
New-Item -ItemType Directory -Path "$stage\Assets" -Force | Out-Null
Copy-Item "$dist\win-unpacked\*" $stage -Recurse -Force
Copy-Item 'build\msix\logo-*.png' "$stage\Assets"

$manifest = (Get-Content 'build\msix\AppxManifest.xml' -Raw).
    Replace('@IDENTITY_NAME@', 'HorizonGoals').
    Replace('@PUBLISHER@', $Publisher).
    Replace('@PUBLISHER_DISPLAY_NAME@', $PublisherDisplayName).
    Replace('@VERSION@', $msixVersion).
    Replace('@ARCH@', 'x64')
Set-Content "$stage\AppxManifest.xml" $manifest -Encoding UTF8

$msix = Join-Path $dist "HorizonGoals-$version-x64.msix"
Invoke-Native $makeappx @('pack', '/d', $stage, '/p', $msix, '/o')

Write-Host '==> Signing the MSIX'
if (-not $CertPath) {
    $cert = New-SelfSignedCertificate -Type Custom -Subject $Publisher -KeyUsage DigitalSignature `
        -FriendlyName 'HorizonGoals dev signing' -CertStoreLocation 'Cert:\CurrentUser\My' `
        -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
    $CertPath = Join-Path $dist 'HorizonGoals-dev.pfx'
    $CertPassword = [guid]::NewGuid().ToString()
    Export-PfxCertificate -Cert $cert -FilePath $CertPath -Password (ConvertTo-SecureString $CertPassword -AsPlainText -Force) | Out-Null
    Export-Certificate -Cert $cert -FilePath (Join-Path $dist 'HorizonGoals-dev.cer') | Out-Null
    Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)"
    Write-Host 'Signed with a generated test certificate. To install on a machine, trust dist\HorizonGoals-dev.cer first (see README).'
}
$signArgs = @('sign', '/fd', 'SHA256', '/a', '/f', $CertPath)
if ($CertPassword) { $signArgs += @('/p', $CertPassword) }
Invoke-Native $signtool ($signArgs + $msix)

Remove-Item $stage -Recurse -Force
if ($CertPath -like "$dist*") { Remove-Item $CertPath -Force }

Write-Host ''
Write-Host 'Built:'
Get-ChildItem $dist -File | ForEach-Object { Write-Host "  $($_.FullName)" }
