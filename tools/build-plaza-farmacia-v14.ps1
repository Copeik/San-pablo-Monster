param(
  [string]$ReferencePath = "assets/references/plaza-farmacia-final-authoritative.png",
  [string]$MapOutput = "maps/plaza-farmacia/base-v14.png",
  [string]$OverviewOutput = "artifacts/plaza-farmacia-overview-v14.png",
  [string]$MobileOutput = "artifacts/plaza-farmacia-mobile-v14.png",
  [string]$PlazaOutput = "artifacts/plaza-farmacia-plaza-v14.png",
  [string]$PharmacySideOutput = "artifacts/plaza-farmacia-pharmacy-side-v14.png",
  [string]$RuinOutput = "artifacts/plaza-farmacia-ruina-v14.png"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot

function Resolve-ProjectPath {
  param([string]$Path)
  if ([System.IO.Path]::IsPathRooted($Path)) { return $Path }
  Join-Path $projectRoot $Path
}

function Save-Crop {
  param(
    [System.Drawing.Bitmap]$Source,
    [System.Drawing.Rectangle]$Rectangle,
    [string]$Path
  )
  $crop = [System.Drawing.Bitmap]::new(
    $Rectangle.Width,
    $Rectangle.Height,
    [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($crop)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.DrawImage(
      $Source,
      [System.Drawing.Rectangle]::new(0, 0, $crop.Width, $crop.Height),
      $Rectangle,
      [System.Drawing.GraphicsUnit]::Pixel
    )
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    $crop.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $crop.Dispose()
  }
}

function Save-Scaled {
  param(
    [System.Drawing.Bitmap]$Source,
    [int]$Width,
    [int]$Height,
    [string]$Path
  )
  $scaled = [System.Drawing.Bitmap]::new(
    $Width,
    $Height,
    [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($scaled)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    $graphics.DrawImage(
      $Source,
      [System.Drawing.Rectangle]::new(0, 0, $Width, $Height),
      [System.Drawing.Rectangle]::new(0, 0, $Source.Width, $Source.Height),
      [System.Drawing.GraphicsUnit]::Pixel
    )
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    $scaled.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $scaled.Dispose()
  }
}

$reference = Resolve-ProjectPath $ReferencePath
$mapPath = Resolve-ProjectPath $MapOutput
$overviewPath = Resolve-ProjectPath $OverviewOutput
$mobilePath = Resolve-ProjectPath $MobileOutput
$plazaPath = Resolve-ProjectPath $PlazaOutput
$pharmacySidePath = Resolve-ProjectPath $PharmacySideOutput
$ruinPath = Resolve-ProjectPath $RuinOutput

if (-not (Test-Path -LiteralPath $reference -PathType Leaf)) {
  throw "No existe la referencia maestra: $reference"
}

$source = [System.Drawing.Bitmap]::FromFile($reference)
try {
  if ($source.Width -ne 1060 -or $source.Height -ne 1484) {
    throw "La referencia debe medir 1060x1484; mide $($source.Width)x$($source.Height)."
  }

  $map = [System.Drawing.Bitmap]::new(
    1280,
    1792,
    [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($map)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    $graphics.DrawImage(
      $source,
      [System.Drawing.Rectangle]::new(0, 0, 1280, 1792),
      [System.Drawing.Rectangle]::new(0, 0, $source.Width, $source.Height),
      [System.Drawing.GraphicsUnit]::Pixel
    )
  } finally {
    $graphics.Dispose()
  }

  try {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $mapPath) | Out-Null
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $overviewPath) | Out-Null
    $map.Save($mapPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $map.Save($overviewPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Save-Scaled $map 640 896 $mobilePath
    Save-Crop $map ([System.Drawing.Rectangle]::new(0, 0, 1280, 1008)) $plazaPath
    Save-Crop $map ([System.Drawing.Rectangle]::new(1024, 608, 256, 384)) $pharmacySidePath
    Save-Crop $map ([System.Drawing.Rectangle]::new(0, 1216, 1280, 576)) $ruinPath
  } finally {
    $map.Dispose()
  }
} finally {
  $source.Dispose()
}

Write-Output $mapPath
Write-Output $overviewPath
Write-Output $mobilePath
Write-Output $plazaPath
Write-Output $pharmacySidePath
Write-Output $ruinPath
