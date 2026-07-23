param(
  [string]$SourceRoot = "assets/generated/plaza-farmacia-pixellab/originals/ruin-v11",
  [string]$OutputPath = "assets/generated/plaza-farmacia-pixellab/runtime-v11/buildings/abandoned-megamall-v11.png"
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

function New-TransparentPixelLabBitmap {
  param([string]$Path)

  $loaded = [System.Drawing.Bitmap]::FromFile($Path)
  try {
    $source = [System.Drawing.Bitmap]::new(
      $loaded.Width,
      $loaded.Height,
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $copyGraphics = [System.Drawing.Graphics]::FromImage($source)
    try {
      $copyGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $copyGraphics.DrawImageUnscaled($loaded, 0, 0)
    } finally {
      $copyGraphics.Dispose()
    }
  } finally {
    $loaded.Dispose()
  }

  # create_map_object reports a transparent background, but its downloaded
  # PNG can contain a flat preview matte. Remove only the edge-connected matte;
  # no PixelLab architecture pixels are painted or synthesized locally.
  $background = $source.GetPixel(0, 0)
  $visited = [bool[]]::new($source.Width * $source.Height)
  $queue = [System.Collections.Generic.Queue[int]]::new()
  for ($x = 0; $x -lt $source.Width; $x += 1) {
    $queue.Enqueue($x)
    $queue.Enqueue(($source.Height - 1) * $source.Width + $x)
  }
  for ($y = 0; $y -lt $source.Height; $y += 1) {
    $queue.Enqueue($y * $source.Width)
    $queue.Enqueue($y * $source.Width + ($source.Width - 1))
  }

  while ($queue.Count -gt 0) {
    $index = $queue.Dequeue()
    if ($visited[$index]) { continue }
    $visited[$index] = $true

    $x = $index % $source.Width
    $y = [int][Math]::Floor($index / $source.Width)
    $color = $source.GetPixel($x, $y)
    $maxDelta = [Math]::Max(
      [Math]::Abs([int]$color.R - $background.R),
      [Math]::Max(
        [Math]::Abs([int]$color.G - $background.G),
        [Math]::Abs([int]$color.B - $background.B)
      )
    )
    if ($maxDelta -gt 18) { continue }

    $source.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
    if ($x -gt 0) { $queue.Enqueue($index - 1) }
    if ($x + 1 -lt $source.Width) { $queue.Enqueue($index + 1) }
    if ($y -gt 0) { $queue.Enqueue($index - $source.Width) }
    if ($y + 1 -lt $source.Height) { $queue.Enqueue($index + $source.Width) }
  }

  $source
}

function New-AlphaCrop {
  param([string]$Path)

  $source = New-TransparentPixelLabBitmap $Path
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
      throw "El componente PixelLab no contiene pixeles opacos: $Path"
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
    } finally {
      $graphics.Dispose()
    }
    $crop
  } finally {
    $source.Dispose()
  }
}

function Draw-ObjectInBox {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$Path,
    [System.Drawing.Rectangle]$Box
  )

  $source = New-AlphaCrop $Path
  try {
    $scaleX = $Box.Width / $source.Width
    $scaleY = $Box.Height / $source.Height
    $scale = [Math]::Min($scaleX, $scaleY)
    $width = [Math]::Max(1, [int][Math]::Round($source.Width * $scale))
    $height = [Math]::Max(1, [int][Math]::Round($source.Height * $scale))
    $x = $Box.X + [int][Math]::Floor(($Box.Width - $width) / 2)
    $y = $Box.Bottom - $height
    $destination = [System.Drawing.Rectangle]::new($x, $y, $width, $height)

    $Graphics.DrawImage(
      $source,
      $destination,
      [System.Drawing.Rectangle]::new(0, 0, $source.Width, $source.Height),
      [System.Drawing.GraphicsUnit]::Pixel
    )
  } finally {
    $source.Dispose()
  }
}

$sourceRootPath = Resolve-ProjectPath $SourceRoot
$outputPathResolved = Resolve-ProjectPath $OutputPath

$components = [ordered]@{
  West = Join-Path $sourceRootPath "west-wing-83b8beb7.png"
  Atrium = Join-Path $sourceRootPath "central-atrium-7b4a272f.png"
  East = Join-Path $sourceRootPath "east-wing-95d906d0.png"
  Rear = Join-Path $sourceRootPath "rear-skeleton-cebaf157.png"
}

foreach ($component in $components.GetEnumerator()) {
  if (-not (Test-Path -LiteralPath $component.Value)) {
    throw "Falta el componente PixelLab '$($component.Key)': $($component.Value)"
  }
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputPathResolved) | Out-Null

$canvas = [System.Drawing.Bitmap]::new(1152, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)
try {
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None

  # PixelLab components are kept intact. The rear frame is layered first;
  # the three foreground masses overlap slightly so the ruin reads as one
  # continuous megamall instead of four isolated props.
  Draw-ObjectInBox $graphics $components.Rear ([System.Drawing.Rectangle]::new(192, 0, 768, 344))
  Draw-ObjectInBox $graphics $components.West ([System.Drawing.Rectangle]::new(-32, 200, 560, 296))
  Draw-ObjectInBox $graphics $components.East ([System.Drawing.Rectangle]::new(624, 200, 560, 296))
  Draw-ObjectInBox $graphics $components.Atrium ([System.Drawing.Rectangle]::new(276, 104, 600, 392))
} finally {
  $graphics.Dispose()
}

try {
  $canvas.Save($outputPathResolved, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $canvas.Dispose()
}

$verification = [System.Drawing.Bitmap]::FromFile($outputPathResolved)
try {
  if ($verification.Width -ne 1152 -or $verification.Height -ne 512) {
    throw "Dimensiones inesperadas: $($verification.Width)x$($verification.Height)"
  }

  $minX = $verification.Width
  $minY = $verification.Height
  $maxX = -1
  $maxY = -1
  for ($y = 0; $y -lt $verification.Height; $y += 1) {
    for ($x = 0; $x -lt $verification.Width; $x += 1) {
      if ($verification.GetPixel($x, $y).A -eq 0) { continue }
      if ($x -lt $minX) { $minX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }

  if ($maxX -lt $minX -or $maxY -lt $minY) { throw "La composicion final esta vacia" }
  $opaqueWidth = $maxX - $minX + 1
  $opaqueHeight = $maxY - $minY + 1
  if ($opaqueWidth -lt 1040 -or $opaqueHeight -lt 360) {
    throw "La ruina no llena el lienzo como megacentro: bbox ${opaqueWidth}x${opaqueHeight}"
  }

  Write-Output "Generated $outputPathResolved (1152x512; opaque bbox ${opaqueWidth}x${opaqueHeight})"
} finally {
  $verification.Dispose()
}
