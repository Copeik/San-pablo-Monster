param(
  [Parameter(Mandatory = $true)]
  [string[]] $Path,
  [ValidateRange(0, 64)]
  [int] $Tolerance = 12,
  [switch] $Trim
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function Test-BackgroundColor {
  param(
    [System.Drawing.Color] $Color,
    [System.Collections.Generic.List[System.Drawing.Color]] $Palette,
    [int] $MaximumDifference
  )

  foreach ($candidate in $Palette) {
    if ([Math]::Abs([int]$Color.R - [int]$candidate.R) -le $MaximumDifference -and
        [Math]::Abs([int]$Color.G - [int]$candidate.G) -le $MaximumDifference -and
        [Math]::Abs([int]$Color.B - [int]$candidate.B) -le $MaximumDifference -and
        [Math]::Abs([int]$Color.A - [int]$candidate.A) -le $MaximumDifference) {
      return $true
    }
  }
  return $false
}

foreach ($inputPath in $Path) {
  $fullPath = (Resolve-Path -LiteralPath $inputPath).Path
  $source = [System.Drawing.Bitmap]::FromFile($fullPath)
  $bitmap = New-Object System.Drawing.Bitmap($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.DrawImageUnscaled($source, 0, 0)
  $graphics.Dispose()
  $source.Dispose()

  $palette = [System.Collections.Generic.List[System.Drawing.Color]]::new()
  for ($x = 0; $x -lt $bitmap.Width; $x++) {
    $palette.Add($bitmap.GetPixel($x, 0))
    $palette.Add($bitmap.GetPixel($x, $bitmap.Height - 1))
  }
  for ($y = 1; $y -lt $bitmap.Height - 1; $y++) {
    $palette.Add($bitmap.GetPixel(0, $y))
    $palette.Add($bitmap.GetPixel($bitmap.Width - 1, $y))
  }

  $visited = New-Object 'bool[]' ($bitmap.Width * $bitmap.Height)
  $queue = [System.Collections.Generic.Queue[int]]::new()
  for ($x = 0; $x -lt $bitmap.Width; $x++) {
    $queue.Enqueue($x)
    $queue.Enqueue(($bitmap.Height - 1) * $bitmap.Width + $x)
  }
  for ($y = 1; $y -lt $bitmap.Height - 1; $y++) {
    $queue.Enqueue($y * $bitmap.Width)
    $queue.Enqueue($y * $bitmap.Width + $bitmap.Width - 1)
  }

  $cleared = 0
  while ($queue.Count -gt 0) {
    $index = $queue.Dequeue()
    if ($visited[$index]) { continue }
    $visited[$index] = $true
    $x = $index % $bitmap.Width
    $y = [Math]::Floor($index / $bitmap.Width)
    $color = $bitmap.GetPixel($x, $y)
    if (-not (Test-BackgroundColor -Color $color -Palette $palette -MaximumDifference $Tolerance)) { continue }

    $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $color.R, $color.G, $color.B))
    $cleared += 1
    if ($x -gt 0) { $queue.Enqueue($index - 1) }
    if ($x + 1 -lt $bitmap.Width) { $queue.Enqueue($index + 1) }
    if ($y -gt 0) { $queue.Enqueue($index - $bitmap.Width) }
    if ($y + 1 -lt $bitmap.Height) { $queue.Enqueue($index + $bitmap.Width) }
  }

  if ($Trim) {
    $minimumX = $bitmap.Width
    $minimumY = $bitmap.Height
    $maximumX = -1
    $maximumY = -1
    for ($y = 0; $y -lt $bitmap.Height; $y++) {
      for ($x = 0; $x -lt $bitmap.Width; $x++) {
        if ($bitmap.GetPixel($x, $y).A -eq 0) { continue }
        if ($x -lt $minimumX) { $minimumX = $x }
        if ($x -gt $maximumX) { $maximumX = $x }
        if ($y -lt $minimumY) { $minimumY = $y }
        if ($y -gt $maximumY) { $maximumY = $y }
      }
    }
    if ($maximumX -lt $minimumX -or $maximumY -lt $minimumY) {
      $bitmap.Dispose()
      throw "The image has no visible pixels: $fullPath"
    }
    $crop = [System.Drawing.Rectangle]::new(
      $minimumX,
      $minimumY,
      $maximumX - $minimumX + 1,
      $maximumY - $minimumY + 1
    )
    $trimmed = $bitmap.Clone($crop, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bitmap.Dispose()
    $bitmap = $trimmed
  }

  $temporaryPath = "$fullPath.alpha.tmp.png"
  $bitmap.Save($temporaryPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $outputSize = "$($bitmap.Width)x$($bitmap.Height)"
  $bitmap.Dispose()
  Move-Item -LiteralPath $temporaryPath -Destination $fullPath -Force
  Write-Output "$(Split-Path -Leaf $fullPath): $cleared background pixels cleared; $outputSize"
}
