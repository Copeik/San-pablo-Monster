param(
  [string]$OutputPath = "maps/plaza-farmacia/reference-preview.png"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$resolvedOutput = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath
} else {
  Join-Path $projectRoot $OutputPath
}

$outputDirectory = Split-Path -Parent $resolvedOutput
if (-not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

function New-Color {
  param(
    [Parameter(Mandatory = $true)][string]$Hex,
    [int]$Alpha = 255
  )

  $clean = $Hex.TrimStart("#")
  return [System.Drawing.Color]::FromArgb(
    $Alpha,
    [Convert]::ToInt32($clean.Substring(0, 2), 16),
    [Convert]::ToInt32($clean.Substring(2, 2), 16),
    [Convert]::ToInt32($clean.Substring(4, 2), 16)
  )
}

function Use-Brush {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Color]$Color,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )

  $brush = New-Object System.Drawing.SolidBrush($Color)
  try { & $Action $brush } finally { $brush.Dispose() }
}

function Use-Pen {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Color]$Color,
    [Parameter(Mandatory = $true)][float]$Width,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )

  $pen = New-Object System.Drawing.Pen($Color, $Width)
  try { & $Action $pen } finally { $pen.Dispose() }
}

function Fill-Rectangle {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Graphics]$Graphics,
    [Parameter(Mandatory = $true)][string]$Color,
    [Parameter(Mandatory = $true)][float]$X,
    [Parameter(Mandatory = $true)][float]$Y,
    [Parameter(Mandatory = $true)][float]$Width,
    [Parameter(Mandatory = $true)][float]$Height,
    [int]$Alpha = 255
  )

  Use-Brush -Color (New-Color $Color $Alpha) -Action {
    param($brush)
    $Graphics.FillRectangle($brush, $X, $Y, $Width, $Height)
  }
}

function Draw-Line {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Graphics]$Graphics,
    [Parameter(Mandatory = $true)][string]$Color,
    [Parameter(Mandatory = $true)][float]$Width,
    [Parameter(Mandatory = $true)][float]$X1,
    [Parameter(Mandatory = $true)][float]$Y1,
    [Parameter(Mandatory = $true)][float]$X2,
    [Parameter(Mandatory = $true)][float]$Y2,
    [int]$Alpha = 255
  )

  Use-Pen -Color (New-Color $Color $Alpha) -Width $Width -Action {
    param($pen)
    $Graphics.DrawLine($pen, $X1, $Y1, $X2, $Y2)
  }
}

function Draw-PlazaBase {
  param([Parameter(Mandatory = $true)][System.Drawing.Graphics]$Graphics)

  Fill-Rectangle $Graphics "#283e35" 0 0 1280 960
  Fill-Rectangle $Graphics "#5d7c63" 32 32 1216 896

  # Zona residencial del fondo.
  Fill-Rectangle $Graphics "#8e9b82" 32 32 1216 256
  for ($x = 32; $x -le 1248; $x += 24) {
    Draw-Line $Graphics "#78866d" 2 $x 32 $x 288
  }
  for ($y = 32; $y -le 288; $y += 24) {
    Draw-Line $Graphics "#78866d" 2 32 $y 1248 $y
  }
  Draw-Line $Graphics "#665f54" 10 32 288 1248 288

  # Explanada peatonal y patrón de adoquines.
  Fill-Rectangle $Graphics "#c9bea7" 32 288 1216 480
  for ($x = 32; $x -le 1248; $x += 32) {
    Draw-Line $Graphics "#aa9d86" 2 $x 288 $x 768
  }
  for ($y = 288; $y -le 768; $y += 32) {
    Draw-Line $Graphics "#aa9d86" 2 32 $y 1248 $y
    Draw-Line $Graphics "#d9cfbb" 1 32 ($y + 8) 1248 ($y + 8) 166
    Draw-Line $Graphics "#d9cfbb" 1 32 ($y + 24) 1248 ($y + 24) 166
  }
  Draw-Line $Graphics "#8f846f" 4 64 352 1216 352 140
  Draw-Line $Graphics "#8f846f" 4 64 736 1216 736 140
  Fill-Rectangle $Graphics "#e5dcc7" 592 320 96 432 66

  # Alcorques.
  Fill-Rectangle $Graphics "#6d6758" 374 412 128 104
  Use-Pen -Color (New-Color "#e0d4ba") -Width 5 -Action {
    param($pen)
    $Graphics.DrawRectangle($pen, 374, 412, 128, 104)
    $Graphics.DrawRectangle($pen, 1002, 446, 112, 96)
  }
  Fill-Rectangle $Graphics "#6d6758" 1002 446 112 96
  Fill-Rectangle $Graphics "#7b925b" 386 424 104 80 242
  Fill-Rectangle $Graphics "#7b925b" 1014 458 88 72 242

  # Calle Jerusalén y paso de peatones.
  Fill-Rectangle $Graphics "#e4ddd0" 32 752 1216 24
  Fill-Rectangle $Graphics "#4b5356" 32 776 1216 152
  for ($x = 32; $x -lt 1248; $x += 32) {
    for ($y = 776; $y -lt 928; $y += 32) {
      Draw-Line $Graphics "#687174" 2 ($x + 6) ($y + 8) ($x + 8) ($y + 8)
      Draw-Line $Graphics "#687174" 2 ($x + 20) ($y + 21) ($x + 23) ($y + 21)
      Draw-Line $Graphics "#343c3f" 2 ($x + 12) ($y + 28) ($x + 14) ($y + 28)
    }
  }
  for ($x = 48; $x -lt 1232; $x += 86) {
    Draw-Line $Graphics "#d8d1b5" 4 $x 850 ([Math]::Min($x + 48, 1232)) 850 191
  }
  for ($y = 784; $y -le 888; $y += 26) {
    Fill-Rectangle $Graphics "#eee9dc" 564 $y 152 14
  }
  Fill-Rectangle $Graphics "#b8b3a8" 544 752 192 24
  for ($x = 544; $x -le 736; $x += 16) {
    Draw-Line $Graphics "#99958c" 2 $x 752 $x 776
  }
  Draw-Line $Graphics "#99958c" 2 544 768 736 768

  # Bolardos.
  foreach ($x in @(92, 174, 256, 338, 420, 850, 932, 1014, 1096, 1178)) {
    Fill-Rectangle $Graphics "#3d4748" $x 735 10 33
    Use-Pen -Color (New-Color "#222c2d") -Width 2 -Action {
      param($pen)
      $Graphics.DrawRectangle($pen, $x, 735, 10, 33)
    }
  }

  Use-Pen -Color (New-Color "#172d25") -Width 8 -Action {
    param($pen)
    $Graphics.DrawRectangle($pen, 32, 32, 1216, 896)
  }
}

function Draw-MapSprite {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Graphics]$Graphics,
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][float]$AnchorX,
    [Parameter(Mandatory = $true)][float]$AnchorY,
    [Parameter(Mandatory = $true)][int]$Width,
    [Parameter(Mandatory = $true)][int]$Height,
    [switch]$FlipX
  )

  $sourcePath = Join-Path $projectRoot $RelativePath
  $image = [System.Drawing.Bitmap]::FromFile($sourcePath)
  try {
    if ($FlipX) {
      $image.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX)
    }
    $destination = New-Object System.Drawing.Rectangle(
      [int][Math]::Round($AnchorX - ($Width / 2)),
      [int][Math]::Round($AnchorY - $Height),
      $Width,
      $Height
    )
    $Graphics.DrawImage($image, $destination, 0, 0, $image.Width, $image.Height, [System.Drawing.GraphicsUnit]::Pixel)
  } finally {
    $image.Dispose()
  }
}

$bitmap = New-Object System.Drawing.Bitmap(1280, 960, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None

  Draw-PlazaBase $graphics

  # Mismo anclaje (centro inferior) y mismo orden de profundidad que el runtime.
  Draw-MapSprite $graphics "assets/generated/san-pablo-rebuilt/runtime/building-rowhouse-tan.png" 252 176 400 188
  Draw-MapSprite $graphics "assets/generated/san-pablo-rebuilt/runtime/building-rowhouse-tan.png" 1018 176 400 188 -FlipX
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/building-bars-strip.png" 224 330 358 109
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/building-pharmacy-san-pablo.png" 592 330 283 132
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/building-bank-neighborhood.png" 890 330 230 140
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/building-shop-neighborhood.png" 1144 330 202 156
  Draw-MapSprite $graphics "assets/generated/san-pablo-rebuilt/runtime/tree-deciduous.png" 438 478 116 142
  Draw-MapSprite $graphics "assets/generated/san-pablo-rebuilt/runtime/tree-deciduous.png" 1058 502 96 118
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/prop-cafe-terrace.png" 190 535 161 107
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/prop-cafe-terrace.png" 715 530 161 107 -FlipX
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/prop-cafe-terrace.png" 930 565 144 96
  Draw-MapSprite $graphics "assets/generated/san-pablo-derived/runtime/prop-park-bench.png" 390 636 76 44
  Draw-MapSprite $graphics "assets/generated/san-pablo-derived/runtime/prop-park-bench.png" 890 650 76 44 -FlipX
  Draw-MapSprite $graphics "assets/generated/san-pablo-derived/runtime/prop-streetlamp.png" 315 690 28 72
  Draw-MapSprite $graphics "assets/generated/san-pablo-derived/runtime/prop-streetlamp.png" 965 690 28 72

  $bitmap.Save($resolvedOutput, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Output $resolvedOutput
