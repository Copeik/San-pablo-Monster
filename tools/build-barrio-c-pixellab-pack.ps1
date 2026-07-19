param(
  [switch]$AllowPending
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Drawing

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pack = Join-Path $root "assets/generated/san-pablo-barrio-c-pixellab"
$sources = Join-Path $pack "sources"
$runtime = Join-Path $pack "runtime"
$pending = [System.Collections.Generic.List[string]]::new()

New-Item -ItemType Directory -Force -Path `
  (Join-Path $runtime "terrain"), `
  (Join-Path $runtime "details"), `
  (Join-Path $runtime "buildings"), `
  (Join-Path $runtime "props") | Out-Null

function Add-Pending([string]$Path) {
  $pending.Add($Path.Substring($root.Length + 1).Replace("\", "/"))
}

function Save-AlphaCrop(
  [string]$Source,
  [string]$Target,
  [int]$X = 0,
  [int]$Y = 0,
  [int]$Width = 0,
  [int]$Height = 0
) {
  if (-not (Test-Path -LiteralPath $Source)) { Add-Pending $Source; return }
  $image = [System.Drawing.Bitmap]::new($Source)
  try {
    if ($Width -le 0) { $Width = $image.Width - $X }
    if ($Height -le 0) { $Height = $image.Height - $Y }
    $left = $X + $Width
    $top = $Y + $Height
    $right = $X - 1
    $bottom = $Y - 1
    for ($py = $Y; $py -lt ($Y + $Height); $py += 1) {
      for ($px = $X; $px -lt ($X + $Width); $px += 1) {
        if ($image.GetPixel($px, $py).A -gt 0) {
          if ($px -lt $left) { $left = $px }
          if ($px -gt $right) { $right = $px }
          if ($py -lt $top) { $top = $py }
          if ($py -gt $bottom) { $bottom = $py }
        }
      }
    }
    if ($right -lt $left -or $bottom -lt $top) { throw "No visible pixels in $Source" }
    $rect = [System.Drawing.Rectangle]::new($left, $top, $right - $left + 1, $bottom - $top + 1)
    $crop = $image.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try { $crop.Save($Target, [System.Drawing.Imaging.ImageFormat]::Png) } finally { $crop.Dispose() }
  } finally { $image.Dispose() }
}

function Add-HorizontalPadding([string]$Path, [int]$Padding = 1) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $temp = "$Path.$([Guid]::NewGuid().ToString('N')).tmp.png"
  $image = [System.Drawing.Bitmap]::new($Path)
  try {
    $padded = [System.Drawing.Bitmap]::new(
      $image.Width + ($Padding * 2),
      $image.Height,
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($padded)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.DrawImageUnscaled($image, $Padding, 0)
      } finally { $graphics.Dispose() }
      $padded.Save($temp, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $padded.Dispose() }
  } finally { $image.Dispose() }
  Move-Item -Force -LiteralPath $temp -Destination $Path
}

$terrainCopies = [ordered]@{
  "terrain/asphalt-sidewalk.png" = "terrain/asphalt-sidewalk.png"
  "terrain/sidewalk-grass.png" = "terrain/sidewalk-grass.png"
}
foreach ($entry in $terrainCopies.GetEnumerator()) {
  $source = Join-Path $sources $entry.Key
  if (Test-Path -LiteralPath $source) {
    Copy-Item -Force -LiteralPath $source -Destination (Join-Path $runtime $entry.Value)
  } else { Add-Pending $source }
}

$detailTiles = 0..15 | ForEach-Object { Join-Path $sources "urban-details/tile_$_.png" }
if ($detailTiles.Where({ -not (Test-Path -LiteralPath $_) }).Count -eq 0) {
  $details = [System.Drawing.Bitmap]::new(128, 128, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($details)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      for ($index = 0; $index -lt 16; $index += 1) {
        $tile = [System.Drawing.Bitmap]::new($detailTiles[$index])
        try {
          if ($tile.Width -ne 32 -or $tile.Height -ne 32) { throw "Unexpected detail size: $($detailTiles[$index])" }
          $graphics.DrawImageUnscaled($tile, ($index % 4) * 32, [Math]::Floor($index / 4) * 32)
        } finally { $tile.Dispose() }
      }
    } finally { $graphics.Dispose() }
    $details.Save((Join-Path $runtime "details/urban-details.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $details.Dispose() }
} else {
  foreach ($tile in $detailTiles) { if (-not (Test-Path -LiteralPath $tile)) { Add-Pending $tile } }
}

$propSource = Join-Path $sources "props"
$propRuntime = Join-Path $runtime "props"
Save-AlphaCrop (Join-Path $propSource "orange-tree-source.png") (Join-Path $propRuntime "orange-tree.png")
Save-AlphaCrop (Join-Path $propSource "deciduous-bench-sheet-source.png") (Join-Path $propRuntime "deciduous-tree.png") 0 0 58 85
Save-AlphaCrop (Join-Path $propSource "bench-streetlamp-sheet-source.png") (Join-Path $propRuntime "bench.png") 0 0 54 85
Save-AlphaCrop (Join-Path $propSource "bench-streetlamp-sheet-source.png") (Join-Path $propRuntime "curved-streetlamp.png") 54 0 31 85
Save-AlphaCrop (Join-Path $propSource "bollard-source.png") (Join-Path $propRuntime "bollard.png")
Save-AlphaCrop (Join-Path $propSource "planter-source.png") (Join-Path $propRuntime "tree-planter.png")
Save-AlphaCrop (Join-Path $propSource "cafe-set-streetlamp-sheet-source.png") (Join-Path $propRuntime "cafe-table-chairs.png") 0 0 64 85

$buildingSource = Join-Path $pack "originals/buildings"
$buildingRuntime = Join-Path $runtime "buildings"
Save-AlphaCrop (Join-Path $buildingSource "mixed-block-south.png") (Join-Path $buildingRuntime "mixed-block-front.png")
Save-AlphaCrop (Join-Path $buildingSource "mixed-block-west.png") (Join-Path $buildingRuntime "mixed-block-vertical-a.png")
Save-AlphaCrop (Join-Path $buildingSource "mixed-block-east.png") (Join-Path $buildingRuntime "mixed-block-vertical-b.png")
Save-AlphaCrop (Join-Path $buildingSource "bank-south.png") (Join-Path $buildingRuntime "bank-front.png")
Save-AlphaCrop (Join-Path $buildingSource "bank-west.png") (Join-Path $buildingRuntime "bank-vertical-a.png")
Save-AlphaCrop (Join-Path $buildingSource "bank-east.png") (Join-Path $buildingRuntime "bank-vertical-b.png")
Save-AlphaCrop (Join-Path $buildingSource "pharmacy-south.png") (Join-Path $buildingRuntime "pharmacy-front.png")
Save-AlphaCrop (Join-Path $buildingSource "pharmacy-west.png") (Join-Path $buildingRuntime "pharmacy-vertical-a.png")
Save-AlphaCrop (Join-Path $buildingSource "pharmacy-east.png") (Join-Path $buildingRuntime "pharmacy-vertical-b.png")
Save-AlphaCrop (Join-Path $buildingSource "cafe-bar-south.png") (Join-Path $buildingRuntime "cafe-bar-front.png")
Save-AlphaCrop (Join-Path $buildingSource "cafe-bar-west.png") (Join-Path $buildingRuntime "cafe-bar-vertical-a.png")
Save-AlphaCrop (Join-Path $buildingSource "cafe-bar-east.png") (Join-Path $buildingRuntime "cafe-bar-vertical-b.png")
Save-AlphaCrop (Join-Path $buildingSource "bar-strip-south.png") (Join-Path $buildingRuntime "bar-strip-front.png")
Save-AlphaCrop (Join-Path $buildingSource "bar-strip-west.png") (Join-Path $buildingRuntime "bar-strip-vertical-a.png")
Save-AlphaCrop (Join-Path $buildingSource "bar-strip-east.png") (Join-Path $buildingRuntime "bar-strip-vertical-b.png")
Save-AlphaCrop (Join-Path $buildingSource "shop-south.png") (Join-Path $buildingRuntime "shop-front.png")
Save-AlphaCrop (Join-Path $buildingSource "shop-west.png") (Join-Path $buildingRuntime "shop-vertical-a.png")
Save-AlphaCrop (Join-Path $buildingSource "shop-east.png") (Join-Path $buildingRuntime "shop-vertical-b.png")

@(
  "bank-vertical-a.png",
  "bank-vertical-b.png",
  "shop-vertical-a.png",
  "shop-vertical-b.png",
  "bar-strip-front.png",
  "bar-strip-vertical-a.png",
  "bar-strip-vertical-b.png"
) | ForEach-Object { Add-HorizontalPadding (Join-Path $buildingRuntime $_) }

$cards = @(
  [pscustomobject]@{ Label = "Asfalto - acera"; File = "runtime/terrain/asphalt-sidewalk.png" },
  [pscustomobject]@{ Label = "Acera - cesped"; File = "runtime/terrain/sidewalk-grass.png" },
  [pscustomobject]@{ Label = "Plaza - cesped"; File = "runtime/terrain/plaza-grass.png"; Pending = "PIXELLAB: WAITING" },
  [pscustomobject]@{ Label = "Tierra - cesped"; File = "runtime/terrain/park-dirt-grass.png"; Pending = "PIXELLAB: WAITING" },
  [pscustomobject]@{ Label = "Detalles urbanos"; File = "runtime/details/urban-details.png" },
  [pscustomobject]@{ Label = "Bloque mixto frontal"; File = "runtime/buildings/mixed-block-front.png" },
  [pscustomobject]@{ Label = "Bloque mixto vertical A"; File = "runtime/buildings/mixed-block-vertical-a.png" },
  [pscustomobject]@{ Label = "Bloque mixto vertical B"; File = "runtime/buildings/mixed-block-vertical-b.png" },
  [pscustomobject]@{ Label = "Banco frontal"; File = "runtime/buildings/bank-front.png" },
  [pscustomobject]@{ Label = "Banco vertical A"; File = "runtime/buildings/bank-vertical-a.png" },
  [pscustomobject]@{ Label = "Banco vertical B"; File = "runtime/buildings/bank-vertical-b.png" },
  [pscustomobject]@{ Label = "Farmacia frontal"; File = "runtime/buildings/pharmacy-front.png" },
  [pscustomobject]@{ Label = "Farmacia vertical A"; File = "runtime/buildings/pharmacy-vertical-a.png" },
  [pscustomobject]@{ Label = "Farmacia vertical B"; File = "runtime/buildings/pharmacy-vertical-b.png" },
  [pscustomobject]@{ Label = "Cafe-bar frontal"; File = "runtime/buildings/cafe-bar-front.png" },
  [pscustomobject]@{ Label = "Cafe-bar vertical A"; File = "runtime/buildings/cafe-bar-vertical-a.png" },
  [pscustomobject]@{ Label = "Cafe-bar vertical B"; File = "runtime/buildings/cafe-bar-vertical-b.png" },
  [pscustomobject]@{ Label = "Fila de bares frontal"; File = "runtime/buildings/bar-strip-front.png" },
  [pscustomobject]@{ Label = "Fila de bares vertical A"; File = "runtime/buildings/bar-strip-vertical-a.png" },
  [pscustomobject]@{ Label = "Fila de bares vertical B"; File = "runtime/buildings/bar-strip-vertical-b.png" },
  [pscustomobject]@{ Label = "Tienda frontal"; File = "runtime/buildings/shop-front.png" },
  [pscustomobject]@{ Label = "Tienda vertical A"; File = "runtime/buildings/shop-vertical-a.png" },
  [pscustomobject]@{ Label = "Tienda vertical B"; File = "runtime/buildings/shop-vertical-b.png" },
  [pscustomobject]@{ Label = "Naranjo"; File = "runtime/props/orange-tree.png" },
  [pscustomobject]@{ Label = "Caducifolio"; File = "runtime/props/deciduous-tree.png" },
  [pscustomobject]@{ Label = "Banco"; File = "runtime/props/bench.png" },
  [pscustomobject]@{ Label = "Farola curva"; File = "runtime/props/curved-streetlamp.png" },
  [pscustomobject]@{ Label = "Bolardo"; File = "runtime/props/bollard.png" },
  [pscustomobject]@{ Label = "Alcorque jardinera"; File = "runtime/props/tree-planter.png" },
  [pscustomobject]@{ Label = "Mesa y sillas"; File = "runtime/props/cafe-table-chairs.png" }
)

$columns = 3
$cellWidth = 330
$cellHeight = 220
$sheetWidth = 20 + $columns * $cellWidth
$sheetHeight = 72 + [Math]::Ceiling($cards.Count / $columns) * $cellHeight
$sheet = [System.Drawing.Bitmap]::new($sheetWidth, $sheetHeight, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
try {
  $graphics = [System.Drawing.Graphics]::FromImage($sheet)
  try {
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#111722"))
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
    $titleFont = [System.Drawing.Font]::new("Arial", 20, [System.Drawing.FontStyle]::Bold)
    $labelFont = [System.Drawing.Font]::new("Arial", 11, [System.Drawing.FontStyle]::Bold)
    $metaFont = [System.Drawing.Font]::new("Arial", 9)
    try {
      $graphics.DrawString("San Pablo - Barrio C | PixelLab", $titleFont, [System.Drawing.Brushes]::White, 20, 18)
      for ($index = 0; $index -lt $cards.Count; $index += 1) {
        $column = $index % $columns
        $row = [Math]::Floor($index / $columns)
        $left = 14 + $column * $cellWidth
        $top = 62 + $row * $cellHeight
        $cardRect = [System.Drawing.Rectangle]::new($left, $top, $cellWidth - 14, $cellHeight - 12)
        $graphics.FillRectangle(([System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#202838"))), $cardRect)
        $graphics.DrawRectangle(([System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml("#52627e"), 2)), $cardRect)
        $graphics.DrawString($cards[$index].Label, $labelFont, [System.Drawing.Brushes]::White, $left + 10, $top + 8)
        $path = Join-Path $pack $cards[$index].File
        $preview = [System.Drawing.Rectangle]::new($left + 10, $top + 48, $cellWidth - 34, $cellHeight - 72)
        for ($y = $preview.Top; $y -lt $preview.Bottom; $y += 12) {
          for ($x = $preview.Left; $x -lt $preview.Right; $x += 12) {
            $color = if (([Math]::Floor(($x - $preview.Left) / 12) + [Math]::Floor(($y - $preview.Top) / 12)) % 2) { "#d5dbe5" } else { "#e9edf3" }
            $graphics.FillRectangle(([System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($color))), $x, $y, [Math]::Min(12, $preview.Right - $x), [Math]::Min(12, $preview.Bottom - $y))
          }
        }
        if (Test-Path -LiteralPath $path) {
          $image = [System.Drawing.Bitmap]::new($path)
          try {
            $graphics.DrawString("$($image.Width)x$($image.Height) RGBA", $metaFont, [System.Drawing.Brushes]::LightSteelBlue, $left + 10, $top + 28)
            $scale = [Math]::Min(($preview.Width - 16) / $image.Width, ($preview.Height - 12) / $image.Height)
            $scale = [Math]::Min($scale, 3.0)
            $width = [Math]::Max(1, [int][Math]::Round($image.Width * $scale))
            $height = [Math]::Max(1, [int][Math]::Round($image.Height * $scale))
            $target = [System.Drawing.Rectangle]::new($preview.Left + [int](($preview.Width - $width) / 2), $preview.Bottom - $height - 4, $width, $height)
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
            $graphics.DrawImage($image, $target)
          } finally { $image.Dispose() }
        } else {
          $pendingLabel = "PENDIENTE DE FUENTE"
          if ($null -ne $cards[$index].PSObject.Properties["Pending"]) { $pendingLabel = $cards[$index].Pending }
          $graphics.DrawString($pendingLabel, $labelFont, [System.Drawing.Brushes]::Tomato, $left + 10, $top + 28)
        }
      }
    } finally { $titleFont.Dispose(); $labelFont.Dispose(); $metaFont.Dispose() }
  } finally { $graphics.Dispose() }
  $sheet.Save((Join-Path $pack "contact-sheet.png"), [System.Drawing.Imaging.ImageFormat]::Png)
} finally { $sheet.Dispose() }

if ($pending.Count) {
  Write-Output "Pending inputs:"
  $pending | Sort-Object -Unique | ForEach-Object { Write-Output "- $_" }
  if (-not $AllowPending) { throw "Barrio C pack has $($pending.Count) pending input(s)" }
} else {
  Write-Output "Barrio C runtime pack rebuilt with no pending inputs."
}
