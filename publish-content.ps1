param(
  [string]$Message = "문구 내용 업데이트"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "1/5 GitHub 최신 내용을 먼저 가져옵니다..."
git fetch origin
git rebase origin/main

Write-Host "2/5 단일 HTML 파일을 다시 만듭니다..."
node .\build-standalone.mjs

Write-Host "3/5 변경 내용을 확인합니다..."
$changes = git status --short
if (-not $changes) {
  Write-Host "업로드할 변경 내용이 없습니다."
  exit 0
}

Write-Host $changes

Write-Host "4/5 변경 내용을 저장합니다..."
git add site-content.json app.js index.html sw.js build-standalone.mjs publish-content.ps1 README.md "신규회선체크.html"
git commit -m $Message

Write-Host "5/5 GitHub에 업로드합니다..."
git push origin main

Write-Host "완료되었습니다. 잠시 후 링크 접속자에게 최신 문구가 반영됩니다."
