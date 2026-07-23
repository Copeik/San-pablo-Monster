param(
  [string]$OutputPath = "assets/generated/plaza-farmacia-pixellab/runtime/buildings/building-u-continuous-v8.png"
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
$buildingKit = Join-Path $projectRoot "assets/generated/plaza-farmacia-pixellab/originals/building-kit-e95ba896"
$storefrontKit = Join-Path $projectRoot "assets/generated/plaza-farmacia-pixellab/originals/storefront-kit-f352b2ac"

function Find-PixelLabTile {
  param([string]$Folder, [int]$Index)
  $match = Get-ChildItem -LiteralPath $Folder -Filter "*_$Index.png" -File | Select-Object -First 1
  if (-not $match) { throw "No se encontro el modulo PixelLab $Index en $Folder" }
  $match.FullName
}

function New-Color {
  param([string]$Hex, [int]$Alpha = 255)
  $clean = $Hex.TrimStart("#")
  [System.Drawing.Color]::FromArgb(
    $Alpha,
    [Convert]::ToInt32($clean.Substring(0, 2), 16),
    [Convert]::ToInt32($clean.Substring(2, 2), 16),
    [Convert]::ToInt32($clean.Substring(4, 2), 16)
  )
}

function New-UPath {
  param([int]$OffsetX = 0, [int]$OffsetY = 0)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $points = [System.Drawing.Point[]]@(
    [System.Drawing.Point]::new(256 + $OffsetX, 672 + $OffsetY),
    [System.Drawing.Point]::new(256 + $OffsetX, 192 + $OffsetY),
    [System.Drawing.Point]::new(832 + $OffsetX, 192 + $OffsetY),
    [System.Drawing.Point]::new(832 + $OffsetX, 672 + $OffsetY),
    [System.Drawing.Point]::new(1088 + $OffsetX, 672 + $OffsetY),
    [System.Drawing.Point]::new(1088 + $OffsetX, 512 + $OffsetY),
    [System.Drawing.Point]::new(1024 + $OffsetX, 512 + $OffsetY),
    [System.Drawing.Point]::new(1024 + $OffsetX, 0 + $OffsetY),
    [System.Drawing.Point]::new(64 + $OffsetX, 0 + $OffsetY),
    [System.Drawing.Point]::new(64 + $OffsetX, 672 + $OffsetY)
  )
  $path.AddPolygon($points)
  $path
}

function Draw-Module {
  param(
    [System.Drawing.Graphics]$Graphics,
    [int]$Index,
    [int]$X,
    [int]$Y,
    [ValidateSet(-90, 0, 90, 180)][int]$Rotation = 0
  )
  $path = Find-PixelLabTile $storefrontKit $Index
  $source = [System.Drawing.Bitmap]::FromFile($path)
  try {
    if ($Rotation -eq 90) {
      $source.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone)
    } elseif ($Rotation -eq -90) {
      $source.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
    } elseif ($Rotation -eq 180) {
      $source.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone)
    }
    $Graphics.DrawImageUnscaled($source, $X, $Y)
  } finally {
    $source.Dispose()
  }
}

function Draw-Label {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$Text,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height,
    [float]$FontSize = 12
  )
  $panelBrush = [System.Drawing.SolidBrush]::new((New-Color "#243035"))
  $borderPen = [System.Drawing.Pen]::new((New-Color "#f0ead9"), 2)
  $textBrush = [System.Drawing.SolidBrush]::new((New-Color "#fffbed"))
  $font = [System.Drawing.Font]::new("Consolas", $FontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  try {
    $rect = [System.Drawing.Rectangle]::new($X, $Y, $Width, $Height)
    $Graphics.FillRectangle($panelBrush, $rect)
    $Graphics.DrawRectangle($borderPen, $rect)
    $Graphics.DrawString($Text, $font, $textBrush, [System.Drawing.RectangleF]::new($X, $Y, $Width, $Height), $format)
  } finally {
    $format.Dispose()
    $font.Dispose()
    $textBrush.Dispose()
    $borderPen.Dispose()
    $panelBrush.Dispose()
  }
}

$bitmap = [System.Drawing.Bitmap]::new(1088, 672, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None

  # Sombra unica: la silueta ya se lee como un solo edificio antes de anadir fachadas.
  $shadowPath = New-UPath 7 8
  $shadowBrush = [System.Drawing.SolidBrush]::new((New-Color "#172522" 105))
  try { $graphics.FillPath($shadowBrush, $shadowPath) } finally { $shadowBrush.Dispose(); $shadowPath.Dispose() }

  # La cubierta usa, sin reescalar, el material gris generado en el building kit de PixelLab.
  $roofSource = [System.Drawing.Bitmap]::FromFile((Find-PixelLabTile $buildingKit 39))
  $roofTile = [System.Drawing.Bitmap]::new(32, 24, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $roofGraphics = [System.Drawing.Graphics]::FromImage($roofTile)
  try {
    $roofGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $roofGraphics.DrawImageUnscaled($roofSource, -10, -59)
  } finally {
    $roofGraphics.Dispose()
    $roofSource.Dispose()
  }
  $roofBrush = [System.Drawing.TextureBrush]::new($roofTile, [System.Drawing.Drawing2D.WrapMode]::Tile)
  $buildingPath = New-UPath
  try { $graphics.FillPath($roofBrush, $buildingPath) } finally { $roofBrush.Dispose(); $roofTile.Dispose() }

  # Bandas de fachada interiores: una sola construccion blanca, sin huecos entre locales.
  $facadeBrush = [System.Drawing.SolidBrush]::new((New-Color "#eeece3"))
  $facadePen = [System.Drawing.Pen]::new((New-Color "#646c6d"), 3)
  try {
    $graphics.FillRectangle($facadeBrush, 256, 128, 576, 64)
    $graphics.FillRectangle($facadeBrush, 192, 192, 64, 480)
    $graphics.FillRectangle($facadeBrush, 832, 192, 64, 480)
    $graphics.FillRectangle($facadeBrush, 832, 608, 256, 64)
    $graphics.DrawRectangle($facadePen, 256, 128, 576, 64)
    $graphics.DrawRectangle($facadePen, 192, 192, 64, 480)
    $graphics.DrawRectangle($facadePen, 832, 192, 64, 480)
    $graphics.DrawRectangle($facadePen, 832, 608, 256, 64)
  } finally { $facadePen.Dispose(); $facadeBrush.Dispose() }

  # Tramo norte, ya espejado de izquierda a derecha: Kebab, cerrado y bar.
  0..1 | ForEach-Object { Draw-Module $graphics 10 (256 + ($_ * 64)) 128 }
  0..3 | ForEach-Object { Draw-Module $graphics 9 (384 + ($_ * 64)) 128 }
  0..2 | ForEach-Object { Draw-Module $graphics 0 (640 + ($_ * 64)) 128 }

  # Ala oeste: Chino, cerrado y Mar de Gambas; todas las puertas miran al patio.
  0..2 | ForEach-Object { Draw-Module $graphics 12 192 (192 + ($_ * 64)) -90 }
  0..1 | ForEach-Object { Draw-Module $graphics 9 192 (384 + ($_ * 64)) -90 }
  0..2 | ForEach-Object { Draw-Module $graphics 14 192 (512 + ($_ * 48)) -90 }

  # Ala este: fruteria y tramo neutro antes de la farmacia de esquina.
  0..1 | ForEach-Object { Draw-Module $graphics 2 832 (192 + ($_ * 64)) 90 }
  $neutralBrush = [System.Drawing.SolidBrush]::new((New-Color "#f4f2ea"))
  $neutralPen = [System.Drawing.Pen]::new((New-Color "#7c8282"), 3)
  try {
    $graphics.FillRectangle($neutralBrush, 836, 320, 56, 192)
    $graphics.DrawRectangle($neutralPen, 836, 320, 56, 192)
    $graphics.DrawLine($neutralPen, 836, 384, 892, 384)
    $graphics.DrawLine($neutralPen, 836, 448, 892, 448)
  } finally { $neutralPen.Dispose(); $neutralBrush.Dispose() }

  # Farmacia en el extremo sureste: cristalera a la carretera y puerta al borde derecho.
  0..3 | ForEach-Object { Draw-Module $graphics 4 (832 + ($_ * 64)) 608 }
  Draw-Module $graphics 7 1024 544 -90
  $pharmacyGlass = [System.Drawing.SolidBrush]::new((New-Color "#b9e7ea" 210))
  $pharmacyFrame = [System.Drawing.Pen]::new((New-Color "#66868a"), 3)
  try {
    $graphics.FillRectangle($pharmacyGlass, 840, 520, 48, 80)
    $graphics.DrawRectangle($pharmacyFrame, 840, 520, 48, 80)
    $graphics.DrawLine($pharmacyFrame, 840, 560, 888, 560)
  } finally { $pharmacyFrame.Dispose(); $pharmacyGlass.Dispose() }

  # Juntas de cada comercio y maquinaria discreta de cubierta.
  $seamPen = [System.Drawing.Pen]::new((New-Color "#a9adaa"), 3)
  $unitBrush = [System.Drawing.SolidBrush]::new((New-Color "#8c9290"))
  $unitHighlight = [System.Drawing.Pen]::new((New-Color "#c9ccc7"), 2)
  try {
    $graphics.DrawLine($seamPen, 384, 0, 384, 192)
    $graphics.DrawLine($seamPen, 640, 0, 640, 192)
    $graphics.DrawLine($seamPen, 64, 384, 256, 384)
    $graphics.DrawLine($seamPen, 64, 512, 256, 512)
    $graphics.DrawLine($seamPen, 832, 320, 1024, 320)
    $graphics.DrawLine($seamPen, 832, 512, 1088, 512)

    @(
      @(116, 236, 38, 22), @(116, 454, 34, 20),
      @(934, 244, 36, 22), @(974, 448, 34, 20),
      @(170, 74, 42, 24), @(478, 72, 38, 22),
      @(730, 72, 44, 24), @(958, 548, 38, 22)
    ) | ForEach-Object {
      $graphics.FillRectangle($unitBrush, $_[0], $_[1], $_[2], $_[3])
      $graphics.DrawRectangle($unitHighlight, $_[0], $_[1], $_[2], $_[3])
      $graphics.DrawLine($unitHighlight, $_[0] + 5, $_[1] + 6, $_[0] + $_[2] - 5, $_[1] + 6)
    }
  } finally { $unitHighlight.Dispose(); $unitBrush.Dispose(); $seamPen.Dispose() }

  # Rotulos integrados dentro de la cubierta, nunca flotando en la plaza.
  Draw-Label $graphics "KEBAB" 272 96 112 24 12
  Draw-Label $graphics "LOCAL CERRADO" 400 96 224 24 11
  Draw-Label $graphics "BAR" 656 96 160 24 13
  Draw-Label $graphics "CHINO" 74 222 110 26 11
  Draw-Label $graphics "CERRADO" 74 398 110 26 9
  Draw-Label $graphics "MAR DE`nGAMBAS" 74 548 110 40 9
  Draw-Label $graphics "FRUTERIA" 904 222 110 28 10
  Draw-Label $graphics "FARMACIA" 858 548 160 28 12

  # Parapeto continuo al final: las esquinas se leen como una sola pieza de puzzle.
  $outlinePen = [System.Drawing.Pen]::new((New-Color "#30383a"), 6)
  $outlinePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Miter
  $highlightPen = [System.Drawing.Pen]::new((New-Color "#f7f5ed"), 2)
  try {
    $graphics.DrawPath($outlinePen, $buildingPath)
    $graphics.DrawLine($highlightPen, 69, 5, 1019, 5)
    $graphics.DrawLine($highlightPen, 261, 187, 827, 187)
    $graphics.DrawLine($highlightPen, 261, 197, 261, 667)
    $graphics.DrawLine($highlightPen, 827, 197, 827, 667)
    $graphics.DrawLine($highlightPen, 69, 667, 251, 667)
    $graphics.DrawLine($highlightPen, 837, 667, 1083, 667)
  } finally {
    $highlightPen.Dispose()
    $outlinePen.Dispose()
    $buildingPath.Dispose()
  }

  $outputDirectory = Split-Path -Parent $resolvedOutput
  if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory | Out-Null
  }
  $bitmap.Save($resolvedOutput, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Output $resolvedOutput
