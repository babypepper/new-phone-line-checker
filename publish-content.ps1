param(
  [string]$Message = "Update site content"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "1/5 Rebuilding standalone HTML..."
node .\build-standalone.mjs

Write-Host "2/5 Checking changes..."
$changes = git status --short
if (-not $changes) {
  Write-Host "No changes to publish."
  exit 0
}

Write-Host $changes

Write-Host "3/5 Creating local commit..."
git add -A
git commit -m $Message

Write-Host "4/5 Syncing with GitHub..."
git fetch origin
git rebase origin/main

Write-Host "5/5 Uploading to GitHub..."
git push origin main

Write-Host "Done. The public link will show the latest content shortly."
