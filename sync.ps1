# Pull, commit, push — in that order.
#
#   .\sync.ps1                      commit with a timestamped message
#   .\sync.ps1 "swap Sat and Sun"   commit with your own message
#
# Safe to run when nothing changed: it pulls, finds nothing to commit, and stops.

param([string]$Message = "")

Set-Location -Path $PSScriptRoot

git rev-parse --git-dir 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Not a git repository: $PSScriptRoot" -ForegroundColor Red
    exit 1
}

Write-Host "Pulling..." -ForegroundColor Cyan
git pull --rebase --autostash
if ($LASTEXITCODE -ne 0) {
    Write-Host "Pull failed. Resolve it first, then run sync again (start with: git status)." -ForegroundColor Red
    exit 1
}

$changes = git status --porcelain
if ([string]::IsNullOrWhiteSpace($changes)) {
    Write-Host "Nothing to commit." -ForegroundColor Yellow
} else {
    if ([string]::IsNullOrWhiteSpace($Message)) {
        $Message = "Update plan and Strava data - " + (Get-Date -Format "yyyy-MM-dd HH:mm")
    }
    Write-Host "Committing: $Message" -ForegroundColor Cyan
    git add -A
    git commit -m $Message
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Commit failed." -ForegroundColor Red
        exit 1
    }
}

git rev-parse --abbrev-ref "@{u}" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "No upstream branch set - skipping push." -ForegroundColor Yellow
    Write-Host "Set one with: git push -u origin main" -ForegroundColor Yellow
    exit 0
}

$ahead = (git rev-list --count "@{u}..HEAD").Trim()
if ($ahead -eq "0") {
    Write-Host "Already in sync with the remote." -ForegroundColor Green
    exit 0
}

Write-Host "Pushing $ahead commit(s)..." -ForegroundColor Cyan
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "Push failed." -ForegroundColor Red
    exit 1
}

Write-Host "Done - Netlify will redeploy in a moment." -ForegroundColor Green
