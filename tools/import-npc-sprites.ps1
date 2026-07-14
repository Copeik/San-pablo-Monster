param(
  [string]$SourceDir = (Join-Path $PSScriptRoot "..\assets\sprites\npcs\source"),
  [string]$OutputDir = (Join-Path $PSScriptRoot "..\assets\sprites\npcs"),
  [int]$StartIndex = 0,
  [int]$Count = [int]::MaxValue
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$cellSize = 64
$frameSize = 192

function Test-IsMagentaChroma {
  param([System.Drawing.Color]$Color)

  # Remove both the flat key and the fuchsia antialias halo while preserving
  # red flowers and the genuinely purple clothes in the supplied characters.
  $balancedMagenta = [Math]::Abs([int]$Color.R - [int]$Color.B) -lt 66
  $magentaDominance = [Math]::Min([int]$Color.R, [int]$Color.B) - [int]$Color.G
  return ($Color.R -gt 205 -and $Color.B -gt 205 -and $Color.G -lt 115) `
    -or ($balancedMagenta -and $magentaDominance -gt 94)
}

function Convert-MagentaToTransparent {
  param(
    [System.Drawing.Bitmap]$Source,
    [int]$CenterX,
    [int]$CenterY,
    [int]$CropWidth,
    [int]$CropHeight
  )

  $frame = [System.Drawing.Bitmap]::new($frameSize, $frameSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $offsetX = [Math]::Round($CenterX - $frameSize / 2)
  $offsetY = [Math]::Round($CenterY - $frameSize / 2)
  $cropLeft = [Math]::Floor(($frameSize - $CropWidth) / 2)
  $cropRight = $cropLeft + $CropWidth
  $cropTop = [Math]::Floor(($frameSize - $CropHeight) / 2)
  $cropBottom = $cropTop + $CropHeight
  for ($y = 0; $y -lt $frameSize; $y += 1) {
    for ($x = 0; $x -lt $frameSize; $x += 1) {
      if ($x -lt $cropLeft -or $x -ge $cropRight -or $y -lt $cropTop -or $y -ge $cropBottom) { continue }
      $sourceX = $offsetX + $x
      $sourceY = $offsetY + $y
      if ($sourceX -lt 0 -or $sourceY -lt 0 -or $sourceX -ge $Source.Width -or $sourceY -ge $Source.Height) { continue }
      $color = $Source.GetPixel($sourceX, $sourceY)
      # The supplied sheets use a flat fuchsia chroma key. Keep red clothes and
      # flowers intact by requiring both red and blue to be high and green low.
      if (Test-IsMagentaChroma $color) { continue }
      $frame.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $color.R, $color.G, $color.B))
    }
  }
  return $frame
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
  if ($right -lt $left) { throw "A frame was empty after chroma-key removal." }
  return [System.Drawing.Rectangle]::FromLTRB($left, $top, $right + 1, $bottom + 1)
}

function Remove-SmallComponents {
  param([System.Drawing.Bitmap]$Bitmap, [int]$MinimumPixels = 36)

  $width = $Bitmap.Width; $height = $Bitmap.Height
  $seen = [bool[]]::new($width * $height)
  for ($start = 0; $start -lt $seen.Length; $start += 1) {
    if ($seen[$start]) { continue }
    $startX = $start % $width; $startY = [Math]::Floor($start / $width)
    if ($Bitmap.GetPixel($startX, $startY).A -eq 0) { $seen[$start] = $true; continue }
    $queue = [System.Collections.Generic.Queue[int]]::new()
    $component = [System.Collections.Generic.List[int]]::new()
    $queue.Enqueue($start); $seen[$start] = $true
    while ($queue.Count -gt 0) {
      $index = $queue.Dequeue(); $component.Add($index)
      $x = $index % $width; $y = [Math]::Floor($index / $width)
      foreach ($delta in @(@(-1, -1), @(0, -1), @(1, -1), @(-1, 0), @(1, 0), @(-1, 1), @(0, 1), @(1, 1))) {
        $nextX = $x + $delta[0]; $nextY = $y + $delta[1]
        if ($nextX -lt 0 -or $nextY -lt 0 -or $nextX -ge $width -or $nextY -ge $height) { continue }
        $next = $nextY * $width + $nextX
        if ($seen[$next] -or $Bitmap.GetPixel($nextX, $nextY).A -eq 0) { continue }
        $seen[$next] = $true; $queue.Enqueue($next)
      }
    }
    if ($component.Count -lt $MinimumPixels) {
      foreach ($index in $component) {
        $Bitmap.SetPixel($index % $width, [Math]::Floor($index / $width), [System.Drawing.Color]::Transparent)
      }
    }
  }
}

function New-WalkSheet {
  param([hashtable]$Definition)

  $path = Join-Path $SourceDir $Definition.source
  $source = [System.Drawing.Bitmap]::new($path)
  try {
    $frames = @()
    foreach ($rowCenter in $Definition.rows) {
      $row = @()
      foreach ($frameIndex in 0..3) {
        $centerX = $Definition.columns[$Definition.frameOrder[$frameIndex]]
        $frame = Convert-MagentaToTransparent -Source $source -CenterX $centerX -CenterY $rowCenter `
          -CropWidth $Definition.cropWidth -CropHeight $Definition.cropHeight
        Remove-SmallComponents $frame
        $row += $frame
      }
      $frames += ,$row
    }

    $bounds = @($frames | ForEach-Object { $_ | ForEach-Object { Get-AlphaBounds $_ } })
    $maxWidth = ($bounds | ForEach-Object Width | Measure-Object -Maximum).Maximum
    $maxHeight = ($bounds | ForEach-Object Height | Measure-Object -Maximum).Maximum
    $scale = [Math]::Min(58 / $maxWidth, 58 / $maxHeight)
    $sheet = [System.Drawing.Bitmap]::new($cellSize * 4, $cellSize * 4, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($sheet)
    try {
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
      $graphics.Clear([System.Drawing.Color]::Transparent)
      for ($rowIndex = 0; $rowIndex -lt 4; $rowIndex += 1) {
        for ($columnIndex = 0; $columnIndex -lt 4; $columnIndex += 1) {
          $frame = $frames[$rowIndex][$columnIndex]
          $box = Get-AlphaBounds $frame
          $width = [Math]::Max(1, [Math]::Round($box.Width * $scale))
          $height = [Math]::Max(1, [Math]::Round($box.Height * $scale))
          $destination = [System.Drawing.Rectangle]::new(
            $columnIndex * $cellSize + [Math]::Floor(($cellSize - $width) / 2),
            $rowIndex * $cellSize + 60 - $height,
            $width,
            $height
          )
          $graphics.DrawImage($frame, $destination, $box, [System.Drawing.GraphicsUnit]::Pixel)
        }
      }
      $destinationPath = Join-Path $OutputDir "$($Definition.id)-walk.png"
      $sheet.Save($destinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
      Write-Output "$($Definition.id) -> $destinationPath"
    } finally {
      $graphics.Dispose(); $sheet.Dispose()
    }
    $frames | ForEach-Object { $_ | ForEach-Object { $_.Dispose() } }
  } finally {
    $source.Dispose()
  }
}

function New-RosterPreview {
  param([array]$Definitions)

  $columns = 5; $cardWidth = 282; $cardHeight = 300
  $rows = [Math]::Ceiling($Definitions.Count / $columns)
  $preview = [System.Drawing.Bitmap]::new($columns * $cardWidth, $rows * $cardHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($preview)
  $font = [System.Drawing.Font]::new("Segoe UI", 10)
  $lightBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(232, 229, 214))
  $darkBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(216, 222, 207))
  try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(241, 238, 222))
    for ($index = 0; $index -lt $Definitions.Count; $index += 1) {
      $left = ($index % $columns) * $cardWidth
      $top = [Math]::Floor($index / $columns) * $cardHeight
      for ($y = 0; $y -lt 256; $y += 16) {
        for ($x = 0; $x -lt 256; $x += 16) {
          $brush = if ((($x / 16) + ($y / 16)) % 2) { $darkBrush } else { $lightBrush }
          $graphics.FillRectangle($brush, $left + 13 + $x, $top + 8 + $y, 16, 16)
        }
      }
      $sheet = [System.Drawing.Bitmap]::new((Join-Path $OutputDir "$($Definitions[$index].id)-walk.png"))
      try { $graphics.DrawImageUnscaled($sheet, $left + 13, $top + 8) } finally { $sheet.Dispose() }
      $graphics.DrawString($Definitions[$index].id, $font, [System.Drawing.Brushes]::Black, $left + 13, $top + 270)
    }
    $preview.Save((Join-Path $OutputDir "npc-imported-roster-preview.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $darkBrush.Dispose(); $lightBrush.Dispose(); $font.Dispose(); $graphics.Dispose(); $preview.Dispose()
  }
}

$definitions = @(
  @{ id = "nino-sol";          source = "roster-01.png"; cropWidth = 78;  cropHeight = 112; columns = @(100, 187, 271); frameOrder = @(0, 1, 0, 2); rows = @(95, 206, 318, 429) },
  @{ id = "chica-lazo";        source = "roster-01.png"; cropWidth = 80;  cropHeight = 112; columns = @(429, 520); frameOrder = @(0, 1, 0, 1); rows = @(95, 206, 318, 429) },
  @{ id = "skater-verde";      source = "roster-01.png"; cropWidth = 88;  cropHeight = 112; columns = @(721, 824); frameOrder = @(0, 1, 0, 1); rows = @(95, 206, 318, 429) },
  @{ id = "mochilera";         source = "roster-01.png"; cropWidth = 82;  cropHeight = 112; columns = @(1017, 1108); frameOrder = @(0, 1, 0, 1); rows = @(95, 206, 318, 429) },
  @{ id = "campesino";         source = "roster-01.png"; cropWidth = 94;  cropHeight = 112; columns = @(1298, 1402); frameOrder = @(0, 1, 0, 1); rows = @(95, 206, 318, 429) },
  @{ id = "nino-polo";         source = "roster-02.png"; cropWidth = 94;  cropHeight = 154; columns = @(123, 240, 359); frameOrder = @(0, 1, 0, 2); rows = @(128, 284, 438, 594) },
  @{ id = "nina-turquesa";     source = "roster-02.png"; cropWidth = 96;  cropHeight = 154; columns = @(564, 676, 780); frameOrder = @(0, 1, 0, 2); rows = @(128, 284, 438, 594) },
  @{ id = "skater-capucha";    source = "roster-02.png"; cropWidth = 110; cropHeight = 154; columns = @(991, 1109); frameOrder = @(0, 1, 0, 1); rows = @(128, 284, 438, 594) },
  @{ id = "chica-mochila";     source = "roster-02.png"; cropWidth = 98;  cropHeight = 154; columns = @(1342, 1454, 1566); frameOrder = @(0, 1, 0, 2); rows = @(128, 284, 438, 594) },
  @{ id = "hortelano";         source = "roster-02.png"; cropWidth = 108; cropHeight = 154; columns = @(1762, 1875, 1994); frameOrder = @(0, 1, 0, 2); rows = @(128, 284, 438, 594) },
  @{ id = "camarera-azul";     source = "roster-03.png"; cropWidth = 100; cropHeight = 172; columns = @(111, 219, 326); frameOrder = @(0, 1, 0, 2); rows = @(148, 321, 493, 665) },
  @{ id = "camarero-bandeja";  source = "roster-03.png"; cropWidth = 112; cropHeight = 172; columns = @(529, 651); frameOrder = @(0, 1, 0, 1); rows = @(148, 321, 493, 665) },
  @{ id = "bailaora";          source = "roster-03.png"; cropWidth = 108; cropHeight = 172; columns = @(900, 1036); frameOrder = @(0, 1, 0, 1); rows = @(148, 321, 493, 665) },
  @{ id = "abuelo-cana";       source = "roster-03.png"; cropWidth = 108; cropHeight = 172; columns = @(1264, 1397); frameOrder = @(0, 1, 0, 1); rows = @(148, 321, 493, 665) },
  @{ id = "abuela-morada";     source = "roster-03.png"; cropWidth = 90;  cropHeight = 172; columns = @(1632, 1736, 1841); frameOrder = @(0, 1, 0, 2); rows = @(148, 321, 493, 665) }
)

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$definitions | Select-Object -Skip $StartIndex -First $Count | ForEach-Object { New-WalkSheet $_ }
$missingSheets = @($definitions | Where-Object { -not (Test-Path (Join-Path $OutputDir "$($_.id)-walk.png")) })
if ($missingSheets.Count -gt 0) {
  Write-Output "Preview deferred until all roster sheets exist."
} else {
  New-RosterPreview $definitions
}
