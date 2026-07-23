param(
  [string]$OutputRoot = "artifacts/pharmacy-view-sketches-v1"
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

function New-AlphaCrop {
  param([string]$Path)
  $source = [System.Drawing.Bitmap]::FromFile($Path)
  try {
    $minX = $source.Width
    $minY = $source.Height
    $maxX = -1
    $maxY = -1
    for ($y = 0; $y -lt $source.Height; $y += 1) {
      for ($x = 0; $x -lt $source.Width; $x += 1) {
        if ($source.GetPixel($x, $y).A -eq 0) { continue }
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
    if ($maxX -lt $minX -or $maxY -lt $minY) {
      throw "El PNG PixelLab no contiene píxeles opacos: $Path"
    }
    $crop = [System.Drawing.Bitmap]::new(
      $maxX - $minX + 1,
      $maxY - $minY + 1,
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($crop)
    try {
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
      $graphics.DrawImage(
        $source,
        [System.Drawing.Rectangle]::new(0, 0, $crop.Width, $crop.Height),
        [System.Drawing.Rectangle]::new($minX, $minY, $crop.Width, $crop.Height),
        [System.Drawing.GraphicsUnit]::Pixel
      )
    } finally { $graphics.Dispose() }
    $crop
  } finally { $source.Dispose() }
}

function New-ImageCrop {
  param(
    [string]$Path,
    [System.Drawing.Rectangle]$SourceRectangle
  )
  $source = [System.Drawing.Bitmap]::FromFile($Path)
  try {
    $crop = [System.Drawing.Bitmap]::new(
      $SourceRectangle.Width,
      $SourceRectangle.Height,
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($crop)
    try {
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
      $graphics.DrawImage(
        $source,
        [System.Drawing.Rectangle]::new(0, 0, $crop.Width, $crop.Height),
        $SourceRectangle,
        [System.Drawing.GraphicsUnit]::Pixel
      )
    } finally { $graphics.Dispose() }
    $crop
  } finally { $source.Dispose() }
}

function New-PixelCanvas {
  param([int]$Width, [int]$Height)
  $bitmap = [System.Drawing.Bitmap]::new(
    $Width,
    $Height,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  [PSCustomObject]@{ Bitmap = $bitmap; Graphics = $graphics }
}

function Save-PixelCanvas {
  param($Canvas, [string]$Path)
  $Canvas.Graphics.Dispose()
  $Canvas.Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $Canvas.Bitmap.Dispose()
}

function New-ViewSketch {
  param(
    [System.Drawing.Bitmap]$Roof,
    [System.Drawing.Bitmap]$Facade,
    [int]$RoofHeight,
    [int]$FacadeHeight
  )
  $canvas = New-PixelCanvas 192 144
  try {
    $top = 136 - $RoofHeight - $FacadeHeight
    $canvas.Graphics.DrawImage(
      $Roof,
      [System.Drawing.Rectangle]::new(16, $top, 160, $RoofHeight),
      [System.Drawing.Rectangle]::new(0, 0, $Roof.Width, $Roof.Height),
      [System.Drawing.GraphicsUnit]::Pixel
    )
    $canvas.Graphics.DrawImage(
      $Facade,
      [System.Drawing.Rectangle]::new(16, $top + $RoofHeight, 160, $FacadeHeight),
      [System.Drawing.Rectangle]::new(0, 0, $Facade.Width, $Facade.Height),
      [System.Drawing.GraphicsUnit]::Pixel
    )
    $result = $canvas.Bitmap.Clone(
      [System.Drawing.Rectangle]::new(0, 0, 192, 144),
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
  } finally {
    $canvas.Graphics.Dispose()
    $canvas.Bitmap.Dispose()
  }
  $result
}

$outputRootPath = Resolve-ProjectPath $OutputRoot
New-Item -ItemType Directory -Force -Path $outputRootPath | Out-Null

$sourceRoot = Resolve-ProjectPath "assets/generated/plaza-farmacia-pixellab/originals/pharmacy-view-sketches-v1"
$facadePath = Join-Path $sourceRoot "pharmacy-c-orthographic.png"
$roofPath = Join-Path $sourceRoot "roof-axis-aligned-teal.png"

# PixelLab's orthographic source is opaque from x=46..145. Its lower 54 px
# contain the complete centered south facade: canopy, glass door, jambs,
# windows and threshold. The upper roof is replaced by the same PixelLab roof
# material at three different depths so only the camera reading changes.
$facade = New-ImageCrop $facadePath ([System.Drawing.Rectangle]::new(46, 57, 100, 54))
$roof = New-AlphaCrop $roofPath

$specs = @(
  [PSCustomObject]@{ Key = "a-balanced"; Roof = 60; Facade = 60 },
  [PSCustomObject]@{ Key = "b-higher"; Roof = 80; Facade = 40 },
  [PSCustomObject]@{ Key = "c-lower"; Roof = 40; Facade = 80 }
)

$sprites = @()
try {
  foreach ($spec in $specs) {
    $sprite = New-ViewSketch $roof $facade $spec.Roof $spec.Facade
    $sprites += $sprite
    $sprite.Save(
      (Join-Path $outputRootPath "pharmacy-$($spec.Key)-192x144.png"),
      [System.Drawing.Imaging.ImageFormat]::Png
    )
  }

  # Mobile-friendly comparison sheet. Labels and card backgrounds belong only
  # to this preview; the three transparent game sprites above remain composed
  # exclusively from PixelLab-generated pixels.
  $sheet = [System.Drawing.Bitmap]::new(1248, 360, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($sheet)
  $cardBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 235, 240, 246))
  $labelBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 28, 39, 54))
  $font = [System.Drawing.Font]::new("Arial", 24, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(255, 214, 221, 231))
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    for ($index = 0; $index -lt $sprites.Count; $index += 1) {
      $cardX = 16 + $index * 410
      $graphics.FillRectangle($cardBrush, $cardX, 16, 394, 328)
      $graphics.DrawString([char](65 + $index), $font, $labelBrush, $cardX + 18, 22)
      $graphics.DrawImage(
        $sprites[$index],
        [System.Drawing.Rectangle]::new($cardX + 5, 50, 384, 288),
        [System.Drawing.Rectangle]::new(0, 0, 192, 144),
        [System.Drawing.GraphicsUnit]::Pixel
      )
    }
    $sheet.Save(
      (Join-Path $outputRootPath "pharmacy-view-options-v1.png"),
      [System.Drawing.Imaging.ImageFormat]::Png
    )
  } finally {
    $font.Dispose()
    $labelBrush.Dispose()
    $cardBrush.Dispose()
    $graphics.Dispose()
    $sheet.Dispose()
  }
} finally {
  foreach ($sprite in $sprites) { $sprite.Dispose() }
  $roof.Dispose()
  $facade.Dispose()
}

Write-Output (Join-Path $outputRootPath "pharmacy-view-options-v1.png")
