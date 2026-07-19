param(
  [string]$SourceDir = "",
  [string]$OutputDir = "",
  [string]$Manifest = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $SourceDir) { $SourceDir = Join-Path $projectRoot "assets\sprites\npcs\legacy-4x4" }
if (-not $OutputDir) { $OutputDir = Join-Path $projectRoot "assets\sprites\npcs\overworld" }
if (-not $Manifest) { $Manifest = Join-Path $projectRoot "assets\sprites\npcs\overworld-manifest.json" }

$cellSize = 64
$frameOrder = @(0, 1, 2, 3, 2, 1)
$directionRows = @(
  @{ name = "down";       source = "down";  sourceRow = 0 },
  @{ name = "down-right"; source = "right"; sourceRow = 2 },
  @{ name = "right";      source = "right"; sourceRow = 2 },
  @{ name = "up-right";   source = "right"; sourceRow = 2 },
  @{ name = "up";         source = "up";    sourceRow = 3 },
  @{ name = "up-left";    source = "left";  sourceRow = 1 },
  @{ name = "left";       source = "left";  sourceRow = 1 },
  @{ name = "down-left";  source = "left";  sourceRow = 1 }
)

$resolvedSource = (Resolve-Path -LiteralPath $SourceDir).Path
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$resolvedOutput = (Resolve-Path -LiteralPath $OutputDir).Path
$sourceSheets = @(Get-ChildItem -LiteralPath $resolvedSource -File -Filter "*-walk.png" | Sort-Object Name)
if (-not $sourceSheets.Count) { throw "No NPC walk sheets found in $resolvedSource" }

$records = foreach ($sourceFile in $sourceSheets) {
  $source = [System.Drawing.Bitmap]::new($sourceFile.FullName)
  try {
    if ($source.Width -ne 256 -or $source.Height -ne 256) {
      throw "Expected a 256x256 legacy NPC sheet: $($sourceFile.FullName)"
    }
    $atlas = [System.Drawing.Bitmap]::new(384, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($atlas)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
      for ($row = 0; $row -lt $directionRows.Count; $row += 1) {
        for ($column = 0; $column -lt $frameOrder.Count; $column += 1) {
          $sourceRectangle = [System.Drawing.Rectangle]::new(
            $frameOrder[$column] * $cellSize,
            $directionRows[$row].sourceRow * $cellSize,
            $cellSize,
            $cellSize
          )
          $destination = [System.Drawing.Rectangle]::new(
            $column * $cellSize,
            $row * $cellSize,
            $cellSize,
            $cellSize
          )
          $graphics.DrawImage($source, $destination, $sourceRectangle, [System.Drawing.GraphicsUnit]::Pixel)
        }
      }
      $output = Join-Path $resolvedOutput $sourceFile.Name
      $atlas.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $graphics.Dispose()
      $atlas.Dispose()
    }
  } finally {
    $source.Dispose()
  }

  [ordered]@{
    id = $sourceFile.BaseName -replace "-walk$", ""
    file = "overworld/$($sourceFile.Name)"
    source = "legacy-4x4/$($sourceFile.Name)"
  }
}

$manifestRecord = [ordered]@{
  version = 1
  contract = "npc-walk-6x8"
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  cellSize = $cellSize
  grid = [ordered]@{ columns = $frameOrder.Count; rows = $directionRows.Count }
  frameOrder = $frameOrder
  rowOrder = @($directionRows | ForEach-Object { $_.name })
  derivedDirections = [ordered]@{
    "down-right" = "right"
    "up-right" = "right"
    "up-left" = "left"
    "down-left" = "left"
  }
  sprites = @($records)
}
$manifestJson = $manifestRecord | ConvertTo-Json -Depth 6
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($Manifest, $manifestJson, $utf8NoBom)
Write-Output "Normalized $($records.Count) NPC sheets -> $resolvedOutput"
Write-Output "Manifest -> $Manifest"
