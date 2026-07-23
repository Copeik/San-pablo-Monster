param(
  [string]$OutputPath = "maps/plaza-farmacia/reference-preview.png"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$resolvedOutput = if ([System.IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $projectRoot $OutputPath }

function New-Color {
  param([string]$Hex, [int]$Alpha = 255)
  $clean = $Hex.TrimStart("#")
  [System.Drawing.Color]::FromArgb($Alpha, [Convert]::ToInt32($clean.Substring(0, 2), 16), [Convert]::ToInt32($clean.Substring(2, 2), 16), [Convert]::ToInt32($clean.Substring(4, 2), 16))
}

function Fill-Rectangle {
  param([System.Drawing.Graphics]$Graphics, [string]$Color, [float]$X, [float]$Y, [float]$Width, [float]$Height, [int]$Alpha = 255)
  $brush = New-Object System.Drawing.SolidBrush((New-Color $Color $Alpha))
  try { $Graphics.FillRectangle($brush, $X, $Y, $Width, $Height) } finally { $brush.Dispose() }
}

function Draw-Rectangle {
  param([System.Drawing.Graphics]$Graphics, [string]$Fill, [string]$Stroke, [float]$StrokeWidth, [float]$X, [float]$Y, [float]$Width, [float]$Height)
  Fill-Rectangle $Graphics $Fill $X $Y $Width $Height
  $pen = New-Object System.Drawing.Pen((New-Color $Stroke), $StrokeWidth)
  try { $Graphics.DrawRectangle($pen, $X, $Y, $Width, $Height) } finally { $pen.Dispose() }
}

function Draw-Line {
  param([System.Drawing.Graphics]$Graphics, [string]$Color, [float]$Width, [float]$X1, [float]$Y1, [float]$X2, [float]$Y2, [int]$Alpha = 255)
  $pen = New-Object System.Drawing.Pen((New-Color $Color $Alpha), $Width)
  try { $Graphics.DrawLine($pen, $X1, $Y1, $X2, $Y2) } finally { $pen.Dispose() }
}

function Draw-Ellipse {
  param([System.Drawing.Graphics]$Graphics, [string]$Fill, [string]$Stroke, [float]$StrokeWidth, [float]$X, [float]$Y, [float]$Width, [float]$Height)
  $brush = New-Object System.Drawing.SolidBrush((New-Color $Fill))
  $pen = New-Object System.Drawing.Pen((New-Color $Stroke), $StrokeWidth)
  try { $Graphics.FillEllipse($brush, $X, $Y, $Width, $Height); $Graphics.DrawEllipse($pen, $X, $Y, $Width, $Height) } finally { $brush.Dispose(); $pen.Dispose() }
}

function Draw-Label {
  param([System.Drawing.Graphics]$Graphics, [string]$Text, [float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$FontSize = 15)
  Draw-Rectangle $Graphics "#243035" "#f0ead9" 3 $X $Y $Width $Height
  $font = New-Object System.Drawing.Font("Consolas", $FontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush((New-Color "#fffbed"))
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  try { $Graphics.DrawString($Text, $font, $brush, [System.Drawing.RectangleF]::new($X, $Y, $Width, $Height), $format) } finally { $format.Dispose(); $brush.Dispose(); $font.Dispose() }
}

function Draw-MapSprite {
  param([System.Drawing.Graphics]$Graphics, [string]$RelativePath, [float]$AnchorX, [float]$AnchorY, [int]$Width, [int]$Height, [switch]$FlipX)
  $sourcePath = Join-Path $projectRoot $RelativePath
  $image = [System.Drawing.Bitmap]::FromFile($sourcePath)
  try {
    if ($FlipX) { $image.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX) }
    $destination = [System.Drawing.Rectangle]::new([int][Math]::Round($AnchorX - ($Width / 2)), [int][Math]::Round($AnchorY - $Height), $Width, $Height)
    $Graphics.DrawImage($image, $destination, 0, 0, $image.Width, $image.Height, [System.Drawing.GraphicsUnit]::Pixel)
  } finally { $image.Dispose() }
}

$bitmap = New-Object System.Drawing.Bitmap(1280, 1792, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None

  Fill-Rectangle $graphics "#263732" 0 0 1280 1792
  Draw-Rectangle $graphics "#475b50" "#162823" 8 32 32 1216 1728

  # Plaza gris y cuadrícula de baldosas.
  Fill-Rectangle $graphics "#aeb1ad" 64 64 1152 784
  for ($x = 64; $x -le 1216; $x += 32) { Draw-Line $graphics "#858b89" 2 $x 64 $x 848 }
  for ($y = 64; $y -le 848; $y += 32) { Draw-Line $graphics "#858b89" 2 64 $y 1216 $y }
  Fill-Rectangle $graphics "#c7c5bd" 32 64 64 1056
  Fill-Rectangle $graphics "#c7c5bd" 1184 64 64 1056

  # Calzada y paso de peatones, apartado de la rampa.
  Fill-Rectangle $graphics "#c7c5bd" 32 800 1216 48
  Fill-Rectangle $graphics "#454b4d" 32 848 1216 208
  Fill-Rectangle $graphics "#c7c5bd" 32 1056 1216 64
  for ($x = 48; $x -lt 1232; $x += 96) { Draw-Line $graphics "#d5cfaa" 6 $x 952 ([Math]::Min($x + 58, 1232)) 952 }
  Draw-Line $graphics "#e4e1d1" 4 48 866 1232 866
  Draw-Line $graphics "#e4e1d1" 4 48 1038 1232 1038
  for ($y = 856; $y -le 1016; $y += 32) { Fill-Rectangle $graphics "#f1eee1" 296 $y 112 20 }
  Fill-Rectangle $graphics "#f1eee1" 296 1060 112 16
  Fill-Rectangle $graphics "#f1eee1" 296 1088 112 16

  # Solar y gran masa oscura del edificio derruido.
  Fill-Rectangle $graphics "#737977" 32 1120 1216 640
  for ($x = 32; $x -le 1248; $x += 48) { Draw-Line $graphics "#555b59" 2 $x 1120 $x 1760 }
  for ($y = 1120; $y -le 1760; $y += 48) { Draw-Line $graphics "#555b59" 2 32 $y 1248 $y }
  Draw-Rectangle $graphics "#3d4243" "#292f30" 8 64 1280 1152 480
  Fill-Rectangle $graphics "#4c5352" 432 1128 416 28

  # El megacentro ocupa casi todo el ancho y queda detrás de la valla.
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/building-abandoned-megamall-ruin.png" 640 1760 1152 480

  # Un unico edificio PixelLab a escala nativa: cubierta, esquinas y fachadas comparten silueta.
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/runtime/buildings/building-u-continuous-v7.png" 640 800 1088 672

  # Hueco circular y rampa unida directamente al asfalto.
  Draw-Ellipse $graphics "#343a3c" "#777d7d" 12 542 342 196 196
  Draw-Ellipse $graphics "#151b1e" "#aeb4b1" 7 568 368 144 144
  $rampBrush = New-Object System.Drawing.SolidBrush((New-Color "#303638"))
  $rampPen = New-Object System.Drawing.Pen((New-Color "#777d7c"), 10)
  $rampPoints = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(552,560), [System.Drawing.PointF]::new(728,560), [System.Drawing.PointF]::new(752,848), [System.Drawing.PointF]::new(528,848))
  try { $graphics.FillPolygon($rampBrush, $rampPoints); $graphics.DrawPolygon($rampPen, $rampPoints) } finally { $rampPen.Dispose(); $rampBrush.Dispose() }
  Draw-Line $graphics "#bca943" 5 640 584 640 916
  Fill-Rectangle $graphics "#3c4244" 510 848 260 70
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/prop-parking-lightwell.png" 640 540 208 208
  $rampAsset = if (Test-Path (Join-Path $projectRoot "assets/generated/plaza-farmacia-pixellab/prop-parking-ramp-roadwide.png")) { "assets/generated/plaza-farmacia-pixellab/prop-parking-ramp-roadwide.png" } else { "assets/generated/plaza-farmacia-pixellab/prop-parking-ramp.png" }
  Draw-MapSprite $graphics $rampAsset 640 848 224 288

  # Terrazas y mobiliario.
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/prop-cafe-terrace.png" 470 486 120 80
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/prop-cafe-terrace.png" 850 486 150 100 -FlipX
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/prop-cafe-terrace.png" 470 718 120 80
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/prop-cafe-terrace.png" 850 718 150 100 -FlipX
  Draw-MapSprite $graphics "assets/generated/san-pablo-derived/runtime/prop-park-bench.png" 470 790 76 44
  Draw-MapSprite $graphics "assets/generated/san-pablo-derived/runtime/prop-park-bench.png" 850 790 76 44 -FlipX
  Draw-MapSprite $graphics "assets/generated/san-pablo-derived/runtime/prop-streetlamp.png" 460 820 28 72
  Draw-MapSprite $graphics "assets/generated/san-pablo-derived/runtime/prop-streetlamp.png" 980 820 28 72

  # Frente continuo de la valla, delante del edificio gigante.
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/prop-gray-metal-fence.png" 160 1216 320 96
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/prop-gray-metal-fence.png" 480 1216 320 96
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/prop-gray-metal-fence.png" 800 1216 320 96
  Draw-MapSprite $graphics "assets/generated/plaza-farmacia-pixellab/prop-gray-metal-fence.png" 1120 1216 320 96

  $framePen = New-Object System.Drawing.Pen((New-Color "#162823"), 8)
  try { $graphics.DrawRectangle($framePen, 32, 32, 1216, 1728) } finally { $framePen.Dispose() }
  $bitmap.Save($resolvedOutput, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Output $resolvedOutput
