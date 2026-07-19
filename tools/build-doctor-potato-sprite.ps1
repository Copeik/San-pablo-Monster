param(
  [string]$Source = (Join-Path $PSScriptRoot "..\assets\sprites\npcs\source\doctor-potato-source.png"),
  [string]$Output = (Join-Path $PSScriptRoot "..\assets\sprites\npcs\legacy-4x4\doctor-potato-walk.png"),
  [string]$Preview = (Join-Path $PSScriptRoot "..\assets\sprites\npcs\previews\doctor-potato-preview.png"),
  [string]$Report = (Join-Path $PSScriptRoot "..\assets\sprites\npcs\metadata\doctor-potato-report.json")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

@($Output, $Preview, $Report) | ForEach-Object {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $_) | Out-Null
}

$cellSize = 64
$sourceColumns = @(0, 1, 0, 3)
$directions = @("down", "left", "right", "up")
$sourceBitmap = [System.Drawing.Bitmap]::new($Source)

function Test-IsMagentaBackground {
  param([System.Drawing.Color]$Color)
  $balancedMagenta = [Math]::Abs([int]$Color.R - [int]$Color.B) -lt 66
  $magentaDominance = [Math]::Min([int]$Color.R, [int]$Color.B) - [int]$Color.G
  return (($Color.R -gt 205 -and $Color.B -gt 205 -and $Color.G -lt 115) -or
    ($balancedMagenta -and $magentaDominance -gt 94))
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
  if ($right -lt $left) { throw "Empty Doctor Potato frame after chroma removal." }
  return [System.Drawing.Rectangle]::FromLTRB($left, $top, $right + 1, $bottom + 1)
}

function Get-SourceEdge {
  param([int]$Index, [int]$Length)
  return [Math]::Round($Index * $Length / 4)
}

function Get-TransparentFrame {
  param([int]$Column, [int]$Row)
  $inset = 3
  $left = (Get-SourceEdge $Column $sourceBitmap.Width) + $inset
  $right = (Get-SourceEdge ($Column + 1) $sourceBitmap.Width) - $inset
  $top = (Get-SourceEdge $Row $sourceBitmap.Height) + $inset
  $bottom = (Get-SourceEdge ($Row + 1) $sourceBitmap.Height) - $inset
  $width = $right - $left; $height = $bottom - $top
  $frame = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt $height; $y += 1) {
    for ($x = 0; $x -lt $width; $x += 1) {
      $color = $sourceBitmap.GetPixel($left + $x, $top + $y)
      if (Test-IsMagentaBackground $color) { continue }
      $frame.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $color.R, $color.G, $color.B))
    }
  }
  return $frame
}

function Remove-SmallAlphaComponents {
  param([System.Drawing.Bitmap]$Bitmap, [int]$MinimumPixels = 20)
  for ($cellRow = 0; $cellRow -lt 4; $cellRow += 1) {
    for ($cellColumn = 0; $cellColumn -lt 4; $cellColumn += 1) {
      $visited = [bool[]]::new($cellSize * $cellSize)
      for ($localY = 0; $localY -lt $cellSize; $localY += 1) {
        for ($localX = 0; $localX -lt $cellSize; $localX += 1) {
          $start = $localY * $cellSize + $localX
          if ($visited[$start]) { continue }
          $visited[$start] = $true
          $pixel = $Bitmap.GetPixel($cellColumn * $cellSize + $localX, $cellRow * $cellSize + $localY)
          if ($pixel.A -eq 0) { continue }

          $queue = [System.Collections.Generic.Queue[int]]::new()
          $component = [System.Collections.Generic.List[int]]::new()
          $queue.Enqueue($start)
          while ($queue.Count -gt 0) {
            $current = $queue.Dequeue()
            $component.Add($current)
            $x = $current % $cellSize; $y = [Math]::Floor($current / $cellSize)
            foreach ($offset in @(@(-1, -1), @(0, -1), @(1, -1), @(-1, 0), @(1, 0), @(-1, 1), @(0, 1), @(1, 1))) {
              $nextX = $x + $offset[0]; $nextY = $y + $offset[1]
              if ($nextX -lt 0 -or $nextY -lt 0 -or $nextX -ge $cellSize -or $nextY -ge $cellSize) { continue }
              $next = $nextY * $cellSize + $nextX
              if ($visited[$next]) { continue }
              $visited[$next] = $true
              $nextPixel = $Bitmap.GetPixel($cellColumn * $cellSize + $nextX, $cellRow * $cellSize + $nextY)
              if ($nextPixel.A -gt 0) { $queue.Enqueue($next) }
            }
          }
          if ($component.Count -ge $MinimumPixels) { continue }
          foreach ($point in $component) {
            $x = $point % $cellSize; $y = [Math]::Floor($point / $cellSize)
            $Bitmap.SetPixel($cellColumn * $cellSize + $x, $cellRow * $cellSize + $y, [System.Drawing.Color]::Transparent)
          }
        }
      }
    }
  }
}

try {
  $cache = @{}
  for ($row = 0; $row -lt 4; $row += 1) {
    foreach ($column in @(0, 1, 3)) {
      $cache["$column,$row"] = Get-TransparentFrame -Column $column -Row $row
    }
  }

  $bounds = @($cache.Values | ForEach-Object { Get-AlphaBounds $_ })
  $maxWidth = ($bounds | ForEach-Object Width | Measure-Object -Maximum).Maximum
  $maxHeight = ($bounds | ForEach-Object Height | Measure-Object -Maximum).Maximum
  $scale = [Math]::Min(58 / $maxWidth, 58 / $maxHeight)
  $sheet = [System.Drawing.Bitmap]::new(256, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($sheet)
  $frameReport = @{}
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    for ($row = 0; $row -lt 4; $row += 1) {
      $metrics = @()
      for ($column = 0; $column -lt 4; $column += 1) {
        $sourceColumn = $sourceColumns[$column]
        $frame = $cache["$sourceColumn,$row"]
        $box = Get-AlphaBounds $frame
        $width = [Math]::Max(1, [Math]::Round($box.Width * $scale))
        $height = [Math]::Max(1, [Math]::Round($box.Height * $scale))
        $x = $column * $cellSize + [Math]::Floor(($cellSize - $width) / 2)
        $y = $row * $cellSize + 60 - $height
        $destination = [System.Drawing.Rectangle]::new($x, $y, $width, $height)
        $graphics.DrawImage($frame, $destination, $box, [System.Drawing.GraphicsUnit]::Pixel)
        $metrics += [ordered]@{
          source = @($sourceColumn, $row)
          bbox = @(($x % 64), ($y % 64), $width, $height)
        }
      }
      $frameReport[$directions[$row]] = $metrics
    }
    $graphics.Flush()
    Remove-SmallAlphaComponents -Bitmap $sheet
    $sheet.Save($Output, [System.Drawing.Imaging.ImageFormat]::Png)

    $previewBitmap = [System.Drawing.Bitmap]::new(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $previewGraphics = [System.Drawing.Graphics]::FromImage($previewBitmap)
    $light = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(235, 232, 216))
    $dark = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(211, 218, 203))
    try {
      for ($y = 0; $y -lt 512; $y += 32) {
        for ($x = 0; $x -lt 512; $x += 32) {
          $brush = if ((($x / 32) + ($y / 32)) % 2) { $dark } else { $light }
          $previewGraphics.FillRectangle($brush, $x, $y, 32, 32)
        }
      }
      $previewGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $previewGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
      $previewGraphics.DrawImage($sheet, [System.Drawing.Rectangle]::new(0, 0, 512, 512))
      $previewBitmap.Save($Preview, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $dark.Dispose(); $light.Dispose(); $previewGraphics.Dispose(); $previewBitmap.Dispose()
    }
  } finally {
    $graphics.Dispose(); $sheet.Dispose()
  }

  $reportData = [ordered]@{
    id = "doctor-potato"
    source_size = @($sourceBitmap.Width, $sourceBitmap.Height)
    output_size = @(256, 256)
    cell_size = 64
    rows = $directions
    sequence = @("neutral", "step-a", "neutral", "step-b")
    scale = $scale
    frames = $frameReport
    back_row_fix = "exactly two attached arms per frame"
  }
  $reportData | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Report -Encoding UTF8
  Write-Output "doctor-potato -> $Output"
} finally {
  if ($null -ne $cache) { $cache.Values | ForEach-Object { $_.Dispose() } }
  $sourceBitmap.Dispose()
}
