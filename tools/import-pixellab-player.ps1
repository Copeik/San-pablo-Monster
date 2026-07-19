param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDir,
  [string]$WalkOutput = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not $WalkOutput) {
  $WalkOutput = Join-Path $PSScriptRoot "..\assets\sprites\protagonist-walk-pixellab.png"
}

$sourceCellSize = 112
$outputCellSize = 64
$sourceCropLeft = 24
$sourceCropTop = 26
$directions = @(
  @{ game = "down";       pixellab = "south" },
  @{ game = "down-right"; pixellab = "south-east" },
  @{ game = "right";      pixellab = "east" },
  @{ game = "up-right";   pixellab = "north-east" },
  @{ game = "up";         pixellab = "north" },
  @{ game = "up-left";    pixellab = "north-west" },
  @{ game = "left";       pixellab = "west" },
  @{ game = "down-left";  pixellab = "south-west" }
)

function Copy-PixelLabCell {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$Source,
    [int]$Column,
    [int]$Row
  )

  $sourceBitmap = [System.Drawing.Bitmap]::new($Source)
  try {
    if ($sourceBitmap.Width -ne $sourceCellSize -or $sourceBitmap.Height -ne $sourceCellSize) {
      throw "Expected a ${sourceCellSize}x${sourceCellSize} PixelLab frame: $Source"
    }
    $destination = [System.Drawing.Rectangle]::new(
      $Column * $outputCellSize,
      $Row * $outputCellSize,
      $outputCellSize,
      $outputCellSize
    )
    $sourceRectangle = [System.Drawing.Rectangle]::new(
      $sourceCropLeft,
      $sourceCropTop,
      $outputCellSize,
      $outputCellSize
    )
    $Graphics.DrawImage($sourceBitmap, $destination, $sourceRectangle, [System.Drawing.GraphicsUnit]::Pixel)
  } finally {
    $sourceBitmap.Dispose()
  }
}

function New-PixelLabAtlas {
  param(
    [int]$Columns,
    [string]$Output,
    [scriptblock]$ResolveSource
  )

  $parent = Split-Path -Parent $Output
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  $atlas = [System.Drawing.Bitmap]::new(
    $Columns * $outputCellSize,
    $directions.Count * $outputCellSize,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($atlas)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    for ($row = 0; $row -lt $directions.Count; $row += 1) {
      for ($column = 0; $column -lt $Columns; $column += 1) {
        $source = & $ResolveSource $directions[$row].pixellab $column
        if (-not (Test-Path -LiteralPath $source)) { throw "Missing PixelLab frame: $source" }
        Copy-PixelLabCell -Graphics $graphics -Source $source -Column $column -Row $row
      }
    }
    $atlas.Save($Output, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $atlas.Dispose()
  }
}

$resolvedSourceDir = (Resolve-Path -LiteralPath $SourceDir).Path
New-PixelLabAtlas -Columns 6 -Output $WalkOutput -ResolveSource {
  param($direction, $frame)
  Join-Path $resolvedSourceDir ("animations\Walk\{0}\frame_{1:D3}.png" -f $direction, $frame)
}

Write-Output "PixelLab walk atlas -> $WalkOutput"
