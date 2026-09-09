# update-manifest.ps1
# Regenerates files.json from the Storage/ folder contents.
# Run this BEFORE every commit after adding or removing files.
#
# Usage:  .\update-manifest.ps1

param(
    [string]$StoragePath = (Join-Path $PSScriptRoot "Storage"),
    [string]$OutputPath  = (Join-Path $PSScriptRoot "files.json")
)

function Build-Tree {
    param([string]$Path, [string]$Name)

    $children = @()

    $items = Get-ChildItem -Path $Path |
        Where-Object { $_.Name -ne ".gitkeep" } |
        Sort-Object @{Expression={$_.PSIsContainer}; Descending=$true}, Name

    foreach ($item in $items) {
        if ($item.PSIsContainer) {
            $children += Build-Tree -Path $item.FullName -Name $item.Name
        } else {
            $children += [PSCustomObject]@{
                name     = $item.Name
                type     = "file"
                size     = [long]$item.Length
                modified = $item.LastWriteTime.ToString("yyyy-MM-dd")
            }
        }
    }

    return [PSCustomObject]@{
        name     = $Name
        type     = "folder"
        modified = (Get-Item $Path).LastWriteTime.ToString("yyyy-MM-dd")
        children = $children
    }
}

# ── Main ──────────────────────────────────────────────────────

if (-not (Test-Path $StoragePath)) {
    Write-Host ""
    Write-Error "Storage folder not found at: $StoragePath"
    exit 1
}

$tree = Build-Tree -Path $StoragePath -Name "Storage"
$json = $tree | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.UTF8Encoding]::new($false))

$fileCount = (Get-ChildItem -Path $StoragePath -Recurse -File |
    Where-Object { $_.Name -ne ".gitkeep" }).Count

Write-Host ""
Write-Host "  [OK] files.json updated" -ForegroundColor Green
Write-Host "  Total files found: $fileCount" -ForegroundColor Cyan
Write-Host ""
