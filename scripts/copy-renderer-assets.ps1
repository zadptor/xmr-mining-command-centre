param()

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "src/renderer"
$dst = Join-Path $root "dist/renderer"

New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item -LiteralPath (Join-Path $src "index.html") -Destination (Join-Path $dst "index.html") -Force
Copy-Item -LiteralPath (Join-Path $src "style.css") -Destination (Join-Path $dst "style.css") -Force

$logo = Join-Path $root "monero-xmr-logo.svg"
if (Test-Path -LiteralPath $logo) {
  Copy-Item -LiteralPath $logo -Destination (Join-Path $dst "monero-xmr-logo.svg") -Force
}

$assetsSrc = Join-Path $src "assets"
$assetsDst = Join-Path $dst "assets"
if (Test-Path -LiteralPath $assetsSrc) {
  New-Item -ItemType Directory -Force -Path $assetsDst | Out-Null
  Copy-Item -Path (Join-Path $assetsSrc "*") -Destination $assetsDst -Force
}
