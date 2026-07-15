param(
  [string]$Source = (Join-Path $PSScriptRoot "..\assets\sprites\npcs\source\rival.png"),
  [string]$Output = (Join-Path $PSScriptRoot "..\assets\sprites\npcs\rival-walk.png"),
  [string]$Preview = (Join-Path $PSScriptRoot "..\assets\sprites\npcs\rival-preview.png")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$sourceBitmap = [System.Drawing.Bitmap]::new($Source)
$sourceCentersX = @(222, 414, 607, 805)
$sourceCentersY = @(175, 383, 593, 802)
$sourceCellSize = 160
$outputCellSize = 64

function Test-IsBackgroundPixel {
  param([System.Drawing.Color]$Color)
  return [Math]::Max([int]$Color.R, [Math]::Max([int]$Color.G, [int]$Color.B)) -le 12
}

function Get-AlphaBounds {
  param([System.Drawing.Bitmap]$Bitmap)
  $left = $Bitmap.Width; $top = $Bitmap.Height; $right = -1; $bottom = -1
  for ($y = 0; $y -lt $Bitmap.Height; $y += 1) {
    for ($x = 0; $x -lt $Bitmap.Width; $x += 1) {
      if ($Bitmap.GetPixel($x, $y).A -eq 0) { continue }
      $left = [Math]::Min($left, $x); $top = [Math]::Min($top, $y)
      $right = [Math]::Max($right, $x); $bottom = [Math]::Max($bottom, $y)
    }
  }
  if ($right -lt $left) { throw "Empty rival frame after background removal." }
  return [System.Drawing.Rectangle]::FromLTRB($left, $top, $right + 1, $bottom + 1)
}

function Get-TransparentFrame {
  param([int]$CenterX, [int]$CenterY)

  $left = $CenterX - [Math]::Floor($sourceCellSize / 2)
  $top = $CenterY - [Math]::Floor($sourceCellSize / 2)
  $background = [bool[]]::new($sourceCellSize * $sourceCellSize)
  $queued = [bool[]]::new($sourceCellSize * $sourceCellSize)
  $queue = [System.Collections.Generic.Queue[int]]::new()

  foreach ($index in 0..($sourceCellSize - 1)) {
    foreach ($point in @(
      @($index, 0), @($index, ($sourceCellSize - 1)),
      @(0, $index), @(($sourceCellSize - 1), $index)
    )) {
      $x = $point[0]; $y = $point[1]; $flat = $y * $sourceCellSize + $x
      if ($queued[$flat]) { continue }
      $queued[$flat] = $true
      if (Test-IsBackgroundPixel ($sourceBitmap.GetPixel($left + $x, $top + $y))) { $queue.Enqueue($flat) }
    }
  }

  while ($queue.Count -gt 0) {
    $flat = $queue.Dequeue()
    $background[$flat] = $true
    $x = $flat % $sourceCellSize; $y = [Math]::Floor($flat / $sourceCellSize)
    foreach ($offset in @(@(-1, 0), @(1, 0), @(0, -1), @(0, 1))) {
      $nextX = $x + $offset[0]; $nextY = $y + $offset[1]
      if ($nextX -lt 0 -or $nextY -lt 0 -or $nextX -ge $sourceCellSize -or $nextY -ge $sourceCellSize) { continue }
      $next = $nextY * $sourceCellSize + $nextX
      if ($queued[$next]) { continue }
      $queued[$next] = $true
      if (Test-IsBackgroundPixel ($sourceBitmap.GetPixel($left + $nextX, $top + $nextY))) { $queue.Enqueue($next) }
    }
  }

  $frame = [System.Drawing.Bitmap]::new($sourceCellSize, $sourceCellSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt $sourceCellSize; $y += 1) {
    for ($x = 0; $x -lt $sourceCellSize; $x += 1) {
      $flat = $y * $sourceCellSize + $x
      if ($background[$flat]) { continue }
      $color = $sourceBitmap.GetPixel($left + $x, $top + $y)
      $frame.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $color.R, $color.G, $color.B))
    }
  }
  return $frame
}

try {
  $frames = @()
  foreach ($centerY in $sourceCentersY) {
    $row = @()
    foreach ($centerX in $sourceCentersX) { $row += Get-TransparentFrame -CenterX $centerX -CenterY $centerY }
    $frames += ,$row
  }

  $bounds = @($frames | ForEach-Object { $_ | ForEach-Object { Get-AlphaBounds $_ } })
  $maxWidth = ($bounds | ForEach-Object Width | Measure-Object -Maximum).Maximum
  $maxHeight = ($bounds | ForEach-Object Height | Measure-Object -Maximum).Maximum
  $scale = [Math]::Min(58 / $maxWidth, 58 / $maxHeight)
  $sheet = [System.Drawing.Bitmap]::new(256, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($sheet)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    for ($row = 0; $row -lt 4; $row += 1) {
      for ($column = 0; $column -lt 4; $column += 1) {
        $frame = $frames[$row][$column]
        $box = Get-AlphaBounds $frame
        $width = [Math]::Max(1, [Math]::Round($box.Width * $scale))
        $height = [Math]::Max(1, [Math]::Round($box.Height * $scale))
        $destination = [System.Drawing.Rectangle]::new(
          $column * $outputCellSize + [Math]::Floor(($outputCellSize - $width) / 2),
          $row * $outputCellSize + 60 - $height,
          $width,
          $height
        )
        $graphics.DrawImage($frame, $destination, $box, [System.Drawing.GraphicsUnit]::Pixel)
      }
    }
    $sheet.Save($Output, [System.Drawing.Imaging.ImageFormat]::Png)

    $previewBitmap = [System.Drawing.Bitmap]::new(256, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $previewGraphics = [System.Drawing.Graphics]::FromImage($previewBitmap)
    $light = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(232, 229, 214))
    $dark = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(216, 222, 207))
    try {
      for ($y = 0; $y -lt 256; $y += 16) {
        for ($x = 0; $x -lt 256; $x += 16) {
          $brush = if ((($x / 16) + ($y / 16)) % 2) { $dark } else { $light }
          $previewGraphics.FillRectangle($brush, $x, $y, 16, 16)
        }
      }
      $previewGraphics.DrawImageUnscaled($sheet, 0, 0)
      $previewBitmap.Save($Preview, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $dark.Dispose(); $light.Dispose(); $previewGraphics.Dispose(); $previewBitmap.Dispose()
    }
  } finally {
    $graphics.Dispose(); $sheet.Dispose()
  }
  $frames | ForEach-Object { $_ | ForEach-Object { $_.Dispose() } }
  Write-Output "rival -> $Output"
} finally {
  $sourceBitmap.Dispose()
}
