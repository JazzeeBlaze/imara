# add-user.ps1
# Interactively adds a new user to users.json with a SHA-256 hashed password.
#
# Usage:  .\add-user.ps1

param(
    [string]$UsersPath = (Join-Path $PSScriptRoot "users.json")
)

if (-not (Test-Path $UsersPath)) {
    Write-Error "users.json not found at: $UsersPath"
    exit 1
}

Write-Host ""
Write-Host "  Add New User" -ForegroundColor Cyan
Write-Host "  ────────────" -ForegroundColor DarkGray

$username    = Read-Host "  Username"
$displayName = Read-Host "  Display Name"
$password    = Read-Host "  Password"

if (-not $username -or -not $password -or -not $displayName) {
    Write-Host ""
    Write-Error "All fields are required."
    exit 1
}

# Hash with SHA-256
$bytes  = [System.Text.Encoding]::UTF8.GetBytes($password)
$sha    = [System.Security.Cryptography.SHA256]::Create()
$hash   = ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join ""

# Read existing users
$data = Get-Content $UsersPath -Raw -Encoding UTF8 | ConvertFrom-Json

# Check for duplicate
$existing = $data.users | Where-Object { $_.username -eq $username }
if ($existing) {
    Write-Host ""
    Write-Error "Username '$username' already exists!"
    exit 1
}

# Append
$newUser = [PSCustomObject]@{
    username     = $username
    passwordHash = $hash
    displayName  = $displayName
}

$data.users += $newUser

# Save
$json = $data | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($UsersPath, $json, [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "  [OK] User added!" -ForegroundColor Green
Write-Host "  Username:    $username" -ForegroundColor White
Write-Host "  Display:     $displayName" -ForegroundColor White
Write-Host "  Hash:        $($hash.Substring(0,16))..." -ForegroundColor DarkGray
Write-Host ""
