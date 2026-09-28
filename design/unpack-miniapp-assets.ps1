$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$partsDir = Join-Path $PSScriptRoot "assets-pack-v1-b64"
$tempZip = Join-Path $PSScriptRoot "monitor-esports-miniapp-assets.zip"
$expectedBase64Length = 55256
$expectedZipSha256 = "77ff70bf59a81392c69c7b80a7d7ad808f17b934b8ec649402da134baea16ff2"

$parts = Get-ChildItem -Path $partsDir -Filter "part-*.txt" | Sort-Object Name
if ($parts.Count -ne 7) {
    throw "Expected 7 asset chunks, found $($parts.Count)."
}

$base64 = ($parts | ForEach-Object { [System.IO.File]::ReadAllText($_.FullName) }) -join ""
if ($base64.Length -ne $expectedBase64Length) {
    throw "Asset pack base64 length mismatch: expected $expectedBase64Length, got $($base64.Length)."
}

try {
    $bytes = [Convert]::FromBase64String($base64)
} catch {
    throw "Asset pack base64 is invalid: $($_.Exception.Message)"
}

[System.IO.File]::WriteAllBytes($tempZip, $bytes)
$actualHash = (Get-FileHash -Path $tempZip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedZipSha256) {
    Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
    throw "Asset pack SHA256 mismatch. Expected $expectedZipSha256, got $actualHash."
}

Expand-Archive -Path $tempZip -DestinationPath $repoRoot -Force
Remove-Item $tempZip -Force

$assetRoot = Join-Path $repoRoot "miniapp\public\assets"
$required = @(
    "brand\logo-full.webp",
    "brand\logo-symbol.webp",
    "brand\app-icon.webp",
    "brand\favicon.png",
    "brand\loading-mark.webp",
    "heroes\hero-home.webp",
    "heroes\match-header.webp",
    "heroes\hero-pro.webp",
    "heroes\hero-history.webp",
    "states\empty-matches.webp",
    "states\empty-history.webp",
    "states\error-state.webp",
    "games\cs2-placeholder.webp",
    "games\dota2-placeholder.webp",
    "games\lol-placeholder.webp",
    "games\valorant-placeholder.webp"
)

$missing = @()
foreach ($relative in $required) {
    if (-not (Test-Path (Join-Path $assetRoot $relative))) {
        $missing += $relative
    }
}
if ($missing.Count -gt 0) {
    throw "Asset extraction completed but required files are missing: $($missing -join ', ')"
}

Write-Host "OK: Monitor eSports Mini App assets extracted to miniapp\public\assets"
Write-Host "SHA256: $actualHash"
