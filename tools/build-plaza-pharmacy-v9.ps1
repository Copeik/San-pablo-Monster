param(
  [string]$OutputRoot = "assets/generated/plaza-farmacia-pixellab/runtime-v12",
  [string]$MapOutput = "maps/plaza-farmacia/base-v12.png",
  [string]$ParkingMapOutput = "maps/parking-plaza-farmacia/base-v3.png"
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

$runtimeRoot = Resolve-ProjectPath $OutputRoot
$buildingOutput = Join-Path $runtimeRoot "buildings"
$propOutput = Join-Path $runtimeRoot "props"
$mapPath = Resolve-ProjectPath $MapOutput
$parkingMapPath = Resolve-ProjectPath $ParkingMapOutput
New-Item -ItemType Directory -Force -Path $buildingOutput, $propOutput, (Split-Path -Parent $mapPath), (Split-Path -Parent $parkingMapPath) | Out-Null

$plazaBuildingKit = Join-Path $projectRoot "assets/generated/plaza-farmacia-pixellab/originals/building-kit-v10-64"
$ruinKit = Join-Path $projectRoot "assets/generated/plaza-farmacia-pixellab/originals/building-kit-v9-ruin"
$parkingKit = Join-Path $projectRoot "assets/generated/plaza-farmacia-pixellab/originals/building-kit-v9-parking"
$storefrontKit = Join-Path $projectRoot "assets/generated/plaza-farmacia-pixellab/originals/storefront-kit-f352b2ac"
$sideFacadeRoot = Join-Path $projectRoot "assets/generated/plaza-farmacia-pixellab/originals/side-facades-v11"
$facadeElementRoot = Join-Path $projectRoot "assets/generated/plaza-farmacia-pixellab/originals/facade-elements-v11"
$terrainRoot = Join-Path $projectRoot "assets/generated/ada-efeso-pixellab/terrain-borderless"
$detailSheetPath = Join-Path $projectRoot "assets/generated/san-pablo-barrio-c-pixellab/runtime/details/urban-details.png"
$selectedRoot = Join-Path $projectRoot "assets/generated/plaza-farmacia-pixellab/originals/v9-selected"

function Find-IndexedPng {
  param([string]$Folder, [int]$Index)
  $file = Get-ChildItem -LiteralPath $Folder -Filter "*_$Index.png" -File | Select-Object -First 1
  if (-not $file) { throw "No se encontro el PNG PixelLab $Index en $Folder" }
  $file.FullName
}

function New-PixelCanvas {
  param([int]$Width, [int]$Height, [bool]$Transparent = $true)
  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  if ($Transparent) { $graphics.Clear([System.Drawing.Color]::Transparent) }
  [PSCustomObject]@{ Bitmap = $bitmap; Graphics = $graphics }
}

function Save-PixelCanvas {
  param($Canvas, [string]$Path)
  $Canvas.Graphics.Dispose()
  $Canvas.Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $Canvas.Bitmap.Dispose()
}

function Draw-ImageNative {
  param([System.Drawing.Graphics]$Graphics, [string]$Path, [int]$X, [int]$Y)
  $image = [System.Drawing.Bitmap]::FromFile($Path)
  try { $Graphics.DrawImageUnscaled($image, $X, $Y) } finally { $image.Dispose() }
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
    if ($maxX -lt $minX -or $maxY -lt $minY) { throw "El PNG PixelLab no contiene pixeles opacos: $Path" }
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

function New-ColorKeyedBitmap {
  param([string]$Path)
  $source = [System.Drawing.Bitmap]::FromFile($Path)
  $result = [System.Drawing.Bitmap]::new($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $background = $source.GetPixel(0, 0)
  try {
    for ($y = 0; $y -lt $source.Height; $y += 1) {
      for ($x = 0; $x -lt $source.Width; $x += 1) {
        $pixel = $source.GetPixel($x, $y)
        if ($pixel.R -eq $background.R -and $pixel.G -eq $background.G -and $pixel.B -eq $background.B) {
          $result.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
        } else {
          $result.SetPixel($x, $y, $pixel)
        }
      }
    }
  } finally { $source.Dispose() }
  $result
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

function Fill-WithPixelLabSample {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$Path,
    [System.Drawing.Rectangle]$SourceRectangle,
    [System.Drawing.Rectangle]$DestinationRectangle
  )
  $sample = New-ImageCrop $Path $SourceRectangle
  $brush = [System.Drawing.TextureBrush]::new($sample, [System.Drawing.Drawing2D.WrapMode]::Tile)
  try {
    $brush.TranslateTransform($DestinationRectangle.X, $DestinationRectangle.Y)
    $Graphics.FillRectangle($brush, $DestinationRectangle)
  } finally {
    $brush.Dispose()
    $sample.Dispose()
  }
}

function Draw-ImageSection {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$Path,
    [System.Drawing.Rectangle]$SourceRectangle,
    [System.Drawing.Rectangle]$DestinationRectangle,
    [bool]$RemoveOpaqueBackground = $false
  )
  $source = if ($RemoveOpaqueBackground) { New-ColorKeyedBitmap $Path } else { [System.Drawing.Bitmap]::FromFile($Path) }
  try {
    $Graphics.DrawImage(
      $source,
      $DestinationRectangle,
      $SourceRectangle,
      [System.Drawing.GraphicsUnit]::Pixel
    )
  } finally { $source.Dispose() }
}

function Draw-AlphaAssetScaled {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$Path,
    [System.Drawing.Rectangle]$DestinationRectangle
  )
  $source = New-AlphaCrop $Path
  try {
    $Graphics.DrawImage(
      $source,
      $DestinationRectangle,
      [System.Drawing.Rectangle]::new(0, 0, $source.Width, $source.Height),
      [System.Drawing.GraphicsUnit]::Pixel
    )
  } finally { $source.Dispose() }
}

function New-RotatedPixelModule {
  param(
    [System.Drawing.Bitmap]$Source,
    [ValidateSet("CW", "CCW")][string]$Direction
  )
  # RotateFlip is a lossless quarter turn: every source pixel maps to exactly
  # one destination pixel, with no interpolation or resampling.
  $rotated = $Source.Clone(
    [System.Drawing.Rectangle]::new(0, 0, $Source.Width, $Source.Height),
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  if ($Direction -eq "CW") {
    $rotated.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone)
  } else {
    $rotated.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
  }
  $rotated
}

function New-BlankPixelLabFrontModule {
  param([int]$Width, [int]$Height)
  $module = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($module)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None

    $eaveHeight = if ($Height -ge 96) { 14 } else { 10 }
    $thresholdHeight = if ($Height -ge 96) { 8 } else { 6 }
    Fill-WithPixelLabSample $graphics $northClosedPath ([System.Drawing.Rectangle]::new(54, 11, 88, 14)) ([System.Drawing.Rectangle]::new(0, 0, $Width, $eaveHeight))
    Fill-WithPixelLabSample $graphics $northClosedPath ([System.Drawing.Rectangle]::new(65, 20, 62, 11)) ([System.Drawing.Rectangle]::new(0, $eaveHeight, $Width, $Height - $eaveHeight - $thresholdHeight))
    Fill-WithPixelLabSample $graphics $northClosedPath ([System.Drawing.Rectangle]::new(38, 75, 118, 6)) ([System.Drawing.Rectangle]::new(0, $Height - $thresholdHeight, $Width, $thresholdHeight))
  } finally { $graphics.Dispose() }
  $module
}

function New-PixelLabStorefrontModule {
  param(
    [ValidateSet("Chino", "Closed", "Seafood", "Fruit", "Blind")][string]$Kind
  )
  # All side bays begin life as complete 160x96 front-facing architecture.
  # Only after roof/eave, wall, opening and threshold coexist in one bitmap is
  # the whole bay quarter-turned to face its courtyard side.
  $module = New-BlankPixelLabFrontModule 160 96
  if ($Kind -eq "Blind") { return $module }

  $graphics = [System.Drawing.Graphics]::FromImage($module)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None

    if ($Kind -eq "Closed") {
      # The full PixelLab shutter remains aspect-correct (192x96 -> 160x80).
      Draw-ImageSection $graphics $northClosedPath ([System.Drawing.Rectangle]::new(0, 0, 192, 96)) ([System.Drawing.Rectangle]::new(0, 8, 160, 80))
    } elseif ($Kind -eq "Chino") {
      # Sample only PixelLab's awning, glazing and entrance. The dark roof
      # square is deliberately excluded so the opening is cut into the one
      # continuous structural wall built above.
      Draw-ImageSection $graphics $westFacadePath ([System.Drawing.Rectangle]::new(9, 138, 110, 61)) ([System.Drawing.Rectangle]::new(16, 20, 128, 68)) $true
    } elseif ($Kind -eq "Seafood") {
      Draw-ImageSection $graphics $westFacadePath ([System.Drawing.Rectangle]::new(10, 300, 108, 98)) ([System.Drawing.Rectangle]::new(20, 14, 120, 74)) $true
    } elseif ($Kind -eq "Fruit") {
      Draw-ImageSection $graphics $eastFacadePath ([System.Drawing.Rectangle]::new(7, 322, 112, 76)) ([System.Drawing.Rectangle]::new(20, 16, 120, 72)) $true
    }
  } finally { $graphics.Dispose() }
  $module
}

function Draw-RotatedStorefrontModule {
  param(
    [System.Drawing.Graphics]$Graphics,
    [ValidateSet("Chino", "Closed", "Seafood", "Fruit", "Blind")][string]$Kind,
    [ValidateSet("CW", "CCW")][string]$Direction,
    [int]$X,
    [int]$Y
  )
  $front = New-PixelLabStorefrontModule $Kind
  try {
    $rotated = New-RotatedPixelModule $front $Direction
    try { $Graphics.DrawImageUnscaled($rotated, $X, $Y) } finally { $rotated.Dispose() }
  } finally { $front.Dispose() }
}

function New-PlazaUPath {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddPolygon([System.Drawing.Point[]]@(
    [System.Drawing.Point]::new(64, 0),
    [System.Drawing.Point]::new(1024, 0),
    [System.Drawing.Point]::new(1024, 512),
    [System.Drawing.Point]::new(1088, 512),
    [System.Drawing.Point]::new(1088, 672),
    [System.Drawing.Point]::new(832, 672),
    [System.Drawing.Point]::new(832, 192),
    [System.Drawing.Point]::new(256, 192),
    [System.Drawing.Point]::new(256, 672),
    [System.Drawing.Point]::new(64, 672)
  ))
  $path
}

function New-FrontModule {
  param([int]$PanelIndex, [int]$QuarterTurns = 0)
  $module = [System.Drawing.Bitmap]::new(64, 64, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($module)
  $facade = New-AlphaCrop (Find-IndexedPng $plazaBuildingKit 23)
  $panel = if ($PanelIndex -ge 0) {
    [System.Drawing.Bitmap]::FromFile((Find-IndexedPng $storefrontKit $PanelIndex))
  } else { $null }
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    # PixelLab tile 23 is alpha-cropped and bottom-aligned. The panel moves
    # down by 15 px so its opaque door/window reaches the y=63 threshold.
    $graphics.DrawImageUnscaled($facade, [int]((64 - $facade.Width) / 2), 64 - $facade.Height)
    if ($panel) { $graphics.DrawImageUnscaled($panel, 0, 15) }
  } finally {
    if ($panel) { $panel.Dispose() }
    $facade.Dispose()
    $graphics.Dispose()
  }
  $turns = (($QuarterTurns % 4) + 4) % 4
  if ($turns -eq 1) { $module.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
  elseif ($turns -eq 2) { $module.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
  elseif ($turns -eq 3) { $module.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
  $module
}

function Draw-FrontStrip {
  param(
    [System.Drawing.Graphics]$Graphics,
    [int[]]$PanelIndices,
    [int]$X,
    [int]$Y,
    [int]$Length,
    [ValidateSet("horizontal", "vertical")][string]$Axis = "horizontal",
    [int]$QuarterTurns = 0
  )
  $state = $Graphics.Save()
  try {
    $clip = if ($Axis -eq "horizontal") {
      [System.Drawing.Rectangle]::new($X, $Y, $Length, 64)
    } else {
      [System.Drawing.Rectangle]::new($X, $Y, 64, $Length)
    }
    $Graphics.SetClip($clip, [System.Drawing.Drawing2D.CombineMode]::Intersect)
    for ($offset = 0; $offset -lt $Length; $offset += 64) {
      $module = New-FrontModule $PanelIndices[([int]($offset / 64)) % $PanelIndices.Count] $QuarterTurns
      try {
        if ($Axis -eq "horizontal") { $Graphics.DrawImageUnscaled($module, $X + $offset, $Y) }
        else { $Graphics.DrawImageUnscaled($module, $X, $Y + $offset) }
      } finally { $module.Dispose() }
    }
  } finally { $Graphics.Restore($state) }
}

# One continuous, transparent U. The roof is the PixelLab building-kit surface;
# every facade plane below is assembled from PixelLab-generated architectural
# material. Side openings are cut into deep continuous walls instead of rotating
# 64 px south-facing stickers.
$plazaU = New-PixelCanvas 1088 672
$roofTile = New-AlphaCrop (Find-IndexedPng $plazaBuildingKit 39)
$roofBrush = [System.Drawing.TextureBrush]::new($roofTile, [System.Drawing.Drawing2D.WrapMode]::Tile)
$uPath = New-PlazaUPath
try {
  $plazaU.Graphics.FillPath($roofBrush, $uPath)
} finally {
  $uPath.Dispose()
  $roofBrush.Dispose()
  $roofTile.Dispose()
}

$northKebabPath = Join-Path $facadeElementRoot "north-kebab-192x96.png"
$northClosedPath = Join-Path $facadeElementRoot "north-closed-192x96.png"
$northBarPath = Join-Path $facadeElementRoot "north-bar-192x96.png"
$pharmacyGlassPath = Join-Path $facadeElementRoot "pharmacy-glass-second-256x96.png"
$westFacadePath = Join-Path $sideFacadeRoot "west-facade-pixellab-9edf869d.png"
$eastFacadePath = Join-Path $sideFacadeRoot "east-facade-pixellab-7fe886e0.png"
$pharmacyDoorSidePath = Join-Path $sideFacadeRoot "pharmacy-door-side-pixellab-d7b97911.png"
$pharmacyDoorCrossPath = Join-Path $sideFacadeRoot "pharmacy-door-cross-pixellab-5b2e7658.png"

# North courtyard facade: one 576x96 architectural plane. The continuous cap,
# stucco and threshold establish the wall; each PixelLab storefront is clipped
# to its exact 192 px bay (Kebab, closed, Bar) without repeating roof modules.
Fill-WithPixelLabSample $plazaU.Graphics $northClosedPath ([System.Drawing.Rectangle]::new(54, 11, 88, 14)) ([System.Drawing.Rectangle]::new(256, 96, 576, 16))
Fill-WithPixelLabSample $plazaU.Graphics $northClosedPath ([System.Drawing.Rectangle]::new(65, 20, 62, 11)) ([System.Drawing.Rectangle]::new(256, 112, 576, 72))
Fill-WithPixelLabSample $plazaU.Graphics $northClosedPath ([System.Drawing.Rectangle]::new(38, 75, 118, 6)) ([System.Drawing.Rectangle]::new(256, 184, 576, 8))
Draw-AlphaAssetScaled $plazaU.Graphics $northKebabPath ([System.Drawing.Rectangle]::new(272, 104, 160, 82))
Draw-AlphaAssetScaled $plazaU.Graphics $northClosedPath ([System.Drawing.Rectangle]::new(464, 104, 160, 82))
Draw-AlphaAssetScaled $plazaU.Graphics $northBarPath ([System.Drawing.Rectangle]::new(656, 104, 160, 82))

# West inner facade, facing east. Each bay is a complete 160x96 PixelLab front
# rotated CCW as one object, so its threshold lands on the courtyard edge at
# x=255. Nothing is pasted sideways onto the roof surface.
Draw-RotatedStorefrontModule $plazaU.Graphics "Chino" "CCW" 160 192
Draw-RotatedStorefrontModule $plazaU.Graphics "Closed" "CCW" 160 352
Draw-RotatedStorefrontModule $plazaU.Graphics "Seafood" "CCW" 160 512

# East inner facade, facing west. Whole modules rotate CW, putting their
# thresholds on x=832. The final 96 px pharmacy return is a deliberately blind
# wall module: no courtyard door, pharmacy glass or cross can appear here.
Draw-RotatedStorefrontModule $plazaU.Graphics "Fruit" "CW" 832 192
Draw-RotatedStorefrontModule $plazaU.Graphics "Closed" "CW" 832 352
Draw-RotatedStorefrontModule $plazaU.Graphics "Blind" "CW" 832 512

# South pharmacy facade: continuous 256x96 cap/wall/threshold. Only the glass
# panes are reused from PixelLab's candidate; its invented central door is never
# sampled. The sole green cross belongs to the east entrance below.
Fill-WithPixelLabSample $plazaU.Graphics $pharmacyGlassPath ([System.Drawing.Rectangle]::new(41, 11, 176, 13)) ([System.Drawing.Rectangle]::new(832, 576, 256, 14))
Fill-WithPixelLabSample $plazaU.Graphics $northClosedPath ([System.Drawing.Rectangle]::new(65, 20, 62, 11)) ([System.Drawing.Rectangle]::new(832, 590, 256, 74))
Fill-WithPixelLabSample $plazaU.Graphics $pharmacyGlassPath ([System.Drawing.Rectangle]::new(41, 81, 176, 6)) ([System.Drawing.Rectangle]::new(832, 664, 256, 8))
Draw-ImageSection $plazaU.Graphics $pharmacyGlassPath ([System.Drawing.Rectangle]::new(41, 24, 98, 54)) ([System.Drawing.Rectangle]::new(840, 596, 104, 62))
Draw-ImageSection $plazaU.Graphics $pharmacyGlassPath ([System.Drawing.Rectangle]::new(41, 24, 98, 54)) ([System.Drawing.Rectangle]::new(968, 596, 104, 62))

# The sole pharmacy entrance is embedded directly into a continuous 64x160
# east-facing wall. PixelLab's dedicated side-door preserves a readable leaf,
# jamb and threshold; the surrounding eave/wall/contact bands make it part of
# the building instead of a detached booth.
$pharmacyDoorEast = [System.Drawing.Bitmap]::new(64, 160, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$pharmacyDoorEastGraphics = [System.Drawing.Graphics]::FromImage($pharmacyDoorEast)
try {
  $pharmacyDoorEastGraphics.Clear([System.Drawing.Color]::Transparent)
  $pharmacyDoorEastGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $pharmacyDoorEastGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $pharmacyDoorEastGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $pharmacyDoorEastGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  Fill-WithPixelLabSample $pharmacyDoorEastGraphics $northClosedPath ([System.Drawing.Rectangle]::new(54, 11, 88, 14)) ([System.Drawing.Rectangle]::new(0, 0, 10, 160))
  Fill-WithPixelLabSample $pharmacyDoorEastGraphics $northClosedPath ([System.Drawing.Rectangle]::new(65, 20, 62, 11)) ([System.Drawing.Rectangle]::new(10, 0, 46, 160))
  Fill-WithPixelLabSample $pharmacyDoorEastGraphics $northClosedPath ([System.Drawing.Rectangle]::new(38, 75, 118, 6)) ([System.Drawing.Rectangle]::new(56, 0, 8, 160))
  Draw-AlphaAssetScaled $pharmacyDoorEastGraphics $pharmacyDoorSidePath ([System.Drawing.Rectangle]::new(9, 38, 46, 84))
  Draw-ImageSection $pharmacyDoorEastGraphics $pharmacyDoorCrossPath ([System.Drawing.Rectangle]::new(14, 7, 36, 18)) ([System.Drawing.Rectangle]::new(14, 28, 36, 18))
} finally { $pharmacyDoorEastGraphics.Dispose() }
try {
  $plazaU.Graphics.DrawImageUnscaled($pharmacyDoorEast, 1024, 512)
} finally {
  $pharmacyDoorEast.Dispose()
}

Save-PixelCanvas $plazaU (Join-Path $buildingOutput "plaza-u-continuous-v12.png")

function Draw-RuinCell {
  param([System.Drawing.Graphics]$Graphics, [int]$Index, [int]$X, [int]$Y)
  # The two-storey PixelLab ruin kit anchors its logical cell at (10,68).
  Draw-ImageNative $Graphics (Find-IndexedPng $ruinKit $Index) ($X - 10) ($Y - 68)
}

function Fill-RuinBlock {
  param(
    [System.Drawing.Graphics]$Graphics,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height,
    [string[]]$MissingCells = @()
  )
  for ($py = $Y; $py -lt ($Y + $Height); $py += 32) {
    for ($px = $X; $px -lt ($X + $Width); $px += 32) {
      $key = "$px,$py"
      if ($MissingCells -contains $key) { continue }
      Draw-RuinCell $Graphics $(if (((($px + $py) / 32) % 7) -eq 0) { 0 } else { 39 }) $px $py
    }
  }
}

function Draw-RuinSouthWall {
  param([System.Drawing.Graphics]$Graphics, [int]$X, [int]$Y, [int]$Width, [int[]]$Gaps = @())
  for ($px = $X; $px -lt ($X + $Width); $px += 32) {
    $column = [int](($px - $X) / 32)
    if ($Gaps -contains $column) { continue }
    $variants = @(44, 47, 49, 50)
    Draw-RuinCell $Graphics $variants[$column % $variants.Count] $px $Y
  }
}

function Draw-RuinEastWall {
  param([System.Drawing.Graphics]$Graphics, [int]$X, [int]$Y, [int]$Height, [int[]]$Gaps = @())
  for ($py = $Y; $py -lt ($Y + $Height); $py += 32) {
    $row = [int](($py - $Y) / 32)
    if ($Gaps -contains $row) { continue }
    Draw-RuinCell $Graphics $(if (($row % 4) -eq 1) { 45 } else { 7 }) $X $py
  }
}

function Draw-RuinWestWall {
  param([System.Drawing.Graphics]$Graphics, [int]$X, [int]$Y, [int]$Height, [int[]]$Gaps = @())
  for ($py = $Y; $py -lt ($Y + $Height); $py += 32) {
    $row = [int](($py - $Y) / 32)
    if ($Gaps -contains $row) { continue }
    Draw-RuinCell $Graphics $(if (($row % 4) -eq 2) { 54 } else { 18 }) $X $py
  }
}

# A native-scale 36x16-tile unfinished mall. Three connected masses surround
# a broken central atrium; missing cells and wall gaps are deliberate damage.
$mall = New-PixelCanvas 1152 512
$roofHoles = @(
  "64,64", "96,64", "256,128", "288,128", "128,256",
  "864,96", "896,96", "1024,224", "1056,224", "960,320",
  "480,32", "640,64", "736,96"
)
Fill-RuinBlock $mall.Graphics 0 0 352 384 $roofHoles
Fill-RuinBlock $mall.Graphics 352 0 448 160 $roofHoles
Fill-RuinBlock $mall.Graphics 800 0 352 384 $roofHoles
Draw-RuinSouthWall $mall.Graphics 0 352 352 @(2, 7)
Draw-RuinSouthWall $mall.Graphics 352 128 448 @(5, 6, 10)
Draw-RuinSouthWall $mall.Graphics 800 352 352 @(3, 8)
Draw-RuinEastWall $mall.Graphics 320 160 224 @(2, 5)
Draw-RuinWestWall $mall.Graphics 800 160 224 @(1, 4)
Save-PixelCanvas $mall (Join-Path $buildingOutput "abandoned-megamall-v9.png")

# Copy only selected PixelLab originals into stable runtime paths.
Copy-Item -LiteralPath (Join-Path $selectedRoot "portal-exterior.png") -Destination (Join-Path $propOutput "parking-portal-exterior.png") -Force
Copy-Item -LiteralPath (Join-Path $selectedRoot "portal-interior.png") -Destination (Join-Path $propOutput "parking-portal-interior.png") -Force
$parkingPortalExteriorWide = New-PixelCanvas 224 128
Draw-ImageNative $parkingPortalExteriorWide.Graphics (Join-Path $selectedRoot "portal-exterior.png") 0 0
Draw-ImageNative $parkingPortalExteriorWide.Graphics (Join-Path $selectedRoot "portal-exterior.png") 96 0
Save-PixelCanvas $parkingPortalExteriorWide (Join-Path $propOutput "parking-portal-exterior-wide.png")
$parkingPortalInteriorWide = New-PixelCanvas 224 128
Draw-ImageNative $parkingPortalInteriorWide.Graphics (Join-Path $selectedRoot "portal-interior.png") 0 0
Draw-ImageNative $parkingPortalInteriorWide.Graphics (Join-Path $selectedRoot "portal-interior.png") 96 0
Save-PixelCanvas $parkingPortalInteriorWide (Join-Path $propOutput "parking-portal-interior-wide.png")
Copy-Item -LiteralPath (Join-Path $selectedRoot "lightwell-high.png") -Destination (Join-Path $propOutput "parking-lightwell-high.png") -Force
$parkingLightwellBelow = New-PixelCanvas 192 192
Draw-ImageNative $parkingLightwellBelow.Graphics (Join-Path $selectedRoot "lightwell-ceiling-grate.png") 0 0
Draw-ImageNative $parkingLightwellBelow.Graphics (Join-Path $selectedRoot "lightwell-below.png") 32 32
Save-PixelCanvas $parkingLightwellBelow (Join-Path $propOutput "parking-lightwell-below.png")
Copy-Item -LiteralPath (Join-Path $selectedRoot "mall-entrance.png") -Destination (Join-Path $buildingOutput "abandoned-megamall-entrance-v9.png") -Force
Copy-Item -LiteralPath (Join-Path $selectedRoot "parking-clutter-a.png") -Destination (Join-Path $propOutput "parking-clutter-a.png") -Force
Copy-Item -LiteralPath (Join-Path $selectedRoot "parking-clutter-b.png") -Destination (Join-Path $propOutput "parking-clutter-b.png") -Force
Copy-Item -LiteralPath (Join-Path $selectedRoot "shop-chino.png") -Destination (Join-Path $propOutput "shop-chino-marker.png") -Force
Copy-Item -LiteralPath (Join-Path $selectedRoot "shop-seafood.png") -Destination (Join-Path $propOutput "shop-seafood-marker.png") -Force
Copy-Item -LiteralPath (Join-Path $selectedRoot "shop-fruit.png") -Destination (Join-Path $propOutput "shop-fruit-marker.png") -Force
# PixelLab supplied one coherent two-lane portal. Its four arrows originally
# pointed south; only the two right-lane arrow patches are quarter-free rotated
# 180 degrees so that lane visibly enters north while the left lane exits south.
$parkingRampSourcePath = Join-Path $facadeElementRoot "parking-ramp-shared-320x160.png"
$parkingRampSource = [System.Drawing.Bitmap]::FromFile($parkingRampSourcePath)
try {
  $parkingRampCorrected = $parkingRampSource.Clone(
    [System.Drawing.Rectangle]::new(0, 0, $parkingRampSource.Width, $parkingRampSource.Height),
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $parkingRampGraphics = [System.Drawing.Graphics]::FromImage($parkingRampCorrected)
  try {
    $parkingRampGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $parkingRampGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $parkingRampGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $arrowPatches = @(
      [PSCustomObject]@{ Rectangle = [System.Drawing.Rectangle]::new(198, 54, 29, 34); MinimumChannel = 110 },
      [PSCustomObject]@{ Rectangle = [System.Drawing.Rectangle]::new(198, 86, 29, 34); MinimumChannel = 150 }
    )
    foreach ($arrowDescriptor in $arrowPatches) {
      $arrowRectangle = $arrowDescriptor.Rectangle

      # Restore the local asphalt first from an arrow-free part of the same
      # lane and same rows; this preserves the dark/light ramp-depth bands.
      $cleanAsphaltRectangle = [System.Drawing.Rectangle]::new(170, $arrowRectangle.Y, $arrowRectangle.Width, $arrowRectangle.Height)
      $cleanAsphalt = $parkingRampSource.Clone($cleanAsphaltRectangle, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      try {
        $parkingRampGraphics.DrawImageUnscaled($cleanAsphalt, $arrowRectangle.X, $arrowRectangle.Y)
      } finally { $cleanAsphalt.Dispose() }

      # Isolate only the bright PixelLab arrow glyph, leaving its old asphalt
      # out of the transform. Rotating this alpha patch avoids rectangular
      # seams while keeping the generated arrow pixels completely unchanged.
      $arrowGlyph = [System.Drawing.Bitmap]::new($arrowRectangle.Width, $arrowRectangle.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      try {
        for ($glyphY = 0; $glyphY -lt $arrowRectangle.Height; $glyphY += 1) {
          for ($glyphX = 0; $glyphX -lt $arrowRectangle.Width; $glyphX += 1) {
            $sourcePixel = $parkingRampSource.GetPixel($arrowRectangle.X + $glyphX, $arrowRectangle.Y + $glyphY)
            if ($sourcePixel.R -ge $arrowDescriptor.MinimumChannel -and
                $sourcePixel.G -ge $arrowDescriptor.MinimumChannel -and
                $sourcePixel.B -ge $arrowDescriptor.MinimumChannel) {
              $arrowGlyph.SetPixel($glyphX, $glyphY, $sourcePixel)
            }
          }
        }
        $arrowGlyph.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone)
        $parkingRampGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
        $parkingRampGraphics.DrawImageUnscaled($arrowGlyph, $arrowRectangle.X, $arrowRectangle.Y)
        $parkingRampGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      } finally { $arrowGlyph.Dispose() }
    }

    # PixelLab's source ended with a horizontal pedestrian strip across both
    # lanes. Remove that foreground strip so the already-painted 192 px asphalt
    # driveway remains visible without a seam all the way to the road.
    $transparentBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::Transparent)
    try {
      $parkingRampGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $parkingRampGraphics.FillRectangle($transparentBrush, 0, 128, 320, 32)
    } finally { $transparentBrush.Dispose() }
  } finally { $parkingRampGraphics.Dispose() }
  try {
    $parkingRampCorrected.Save((Join-Path $propOutput "parking-ramp-shared-320x160.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $parkingRampCorrected.Dispose() }
} finally { $parkingRampSource.Dispose() }
Copy-Item -LiteralPath (Join-Path $selectedRoot "web-round.png") -Destination (Join-Path $propOutput "parking-web-round.png") -Force
Copy-Item -LiteralPath (Join-Path $selectedRoot "web-corner.png") -Destination (Join-Path $propOutput "parking-web-corner.png") -Force
Copy-Item -LiteralPath (Join-Path $selectedRoot "web-wide.png") -Destination (Join-Path $propOutput "parking-web-wide.png") -Force

function Fill-WithTile {
  param([System.Drawing.Graphics]$Graphics, [string]$TilePath, [int]$X, [int]$Y, [int]$Width, [int]$Height)
  $tile = [System.Drawing.Bitmap]::FromFile($TilePath)
  try {
    for ($py = $Y; $py -lt ($Y + $Height); $py += $tile.Height) {
      for ($px = $X; $px -lt ($X + $Width); $px += $tile.Width) {
        $Graphics.DrawImageUnscaled($tile, $px, $py)
      }
    }
  } finally { $tile.Dispose() }
}

function Draw-RotatedTile {
  param([System.Drawing.Graphics]$Graphics, [string]$TilePath, [int]$X, [int]$Y, [int]$QuarterTurns)
  $tile = [System.Drawing.Bitmap]::FromFile($TilePath)
  try {
    if (($QuarterTurns % 4) -eq 1) { $tile.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
    elseif (($QuarterTurns % 4) -eq 2) { $tile.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
    elseif (($QuarterTurns % 4) -eq 3) { $tile.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
    $Graphics.DrawImageUnscaled($tile, $X, $Y)
  } finally { $tile.Dispose() }
}

$plazaTile = Join-Path $terrainRoot "tile-04.png"
$asphaltTile = Join-Path $terrainRoot "tile-01.png"
$sidewalkTile = Join-Path $terrainRoot "tile-02.png"
$dashTile = Join-Path $terrainRoot "tile-07.png"

$base = New-PixelCanvas 1280 1792 $false
Fill-WithTile $base.Graphics $plazaTile 0 0 1280 1792

# Plaza at street level and pedestrian approaches from both lateral edges.
Fill-WithTile $base.Graphics $sidewalkTile 32 32 64 832
Fill-WithTile $base.Graphics $sidewalkTile 1184 32 64 832

# Two-way road and its two horizontal sidewalks.
Fill-WithTile $base.Graphics $sidewalkTile 0 832 1280 32
Fill-WithTile $base.Graphics $asphaltTile 0 864 1280 224
Fill-WithTile $base.Graphics $sidewalkTile 0 1088 1280 64
for ($x = 0; $x -lt 1280; $x += 32) { Draw-RotatedTile $base.Graphics $dashTile $x 960 1 }

# Garage ramp: a 6-tile native corridor begins at the road and descends north.
Fill-WithTile $base.Graphics $asphaltTile 544 608 192 256
for ($y = 608; $y -lt 864; $y += 32) { Draw-ImageNative $base.Graphics $dashTile 624 $y }
Fill-WithTile $base.Graphics $sidewalkTile 512 608 32 256
Fill-WithTile $base.Graphics $sidewalkTile 736 608 32 256

# Zebra crossing, four tiles wide, safely left of the ramp. PixelLab's
# broad road stripe becomes one continuous horizontal bar per 64 px step.
$zebraTile = Join-Path $terrainRoot "tile-09.png"
for ($y = 864; $y -lt 1088; $y += 64) {
  for ($x = 320; $x -lt 448; $x += 32) { Draw-RotatedTile $base.Graphics $zebraTile $x $y 1 }
}

# Fenced abandoned plot across the road; the mall modules are rendered above it.
Fill-WithTile $base.Graphics $asphaltTile 32 1152 1216 640
Save-PixelCanvas $base $mapPath

function Draw-ParkingCell {
  param([System.Drawing.Graphics]$Graphics, [int]$Index, [int]$X, [int]$Y)
  Draw-ImageNative $Graphics (Find-IndexedPng $parkingKit $Index) ($X - 10) ($Y - 39)
}

$parkingBlockedRects = @(
  @(5, 4, 6, 12), @(5, 16, 6, 27),
  @(11, 8, 12, 21), @(11, 25, 12, 29),
  @(15, 4, 16, 10), @(23, 4, 24, 12),
  @(23, 20, 24, 28), @(29, 7, 30, 19),
  @(29, 23, 30, 29), @(35, 4, 36, 14),
  @(35, 18, 36, 27), @(6, 12, 11, 13),
  @(12, 21, 16, 22),
  @(24, 19, 30, 20), @(30, 14, 36, 15),
  @(6, 27, 12, 28), @(16, 13, 16, 18),
  @(25, 13, 26, 17), @(17, 24, 21, 25),
  @(25, 8, 28, 9), @(7, 18, 10, 19),
  @(31, 24, 34, 25), @(2, 8, 4, 9)
)

$parkingBase = New-PixelCanvas 1280 1024 $false
for ($row = 0; $row -lt 32; $row += 1) {
  for ($col = 0; $col -lt 40; $col += 1) {
    Draw-ParkingCell $parkingBase.Graphics 0 ($col * 32) ($row * 32)
  }
}

# Native two-lane ramp corridor: 192 px of asphalt plus 32 px margins,
# exactly matching the exterior mouth rather than widening underground.
Fill-WithTile $parkingBase.Graphics $asphaltTile 544 0 192 288
for ($y = 0; $y -lt 288; $y += 32) { Draw-ImageNative $parkingBase.Graphics $dashTile 624 $y }

# PixelLab parking-bay vocabulary, stamped without scaling around the perimeter.
$parkingEdge = Join-Path $projectRoot "assets/generated/san-pablo-barrio-c-pixellab/runtime/details/tile-02-parking-edge.png"
$parkingCorner = Join-Path $projectRoot "assets/generated/san-pablo-barrio-c-pixellab/runtime/details/tile-03-parking-corner.png"
$parkingT = Join-Path $projectRoot "assets/generated/san-pablo-barrio-c-pixellab/runtime/details/tile-04-parking-t.png"
$parkingDrain = Join-Path $projectRoot "assets/generated/san-pablo-barrio-c-pixellab/runtime/details/tile-12-drain-grate.png"
for ($x = 64; $x -lt 448; $x += 64) { Draw-ImageNative $parkingBase.Graphics $parkingEdge $x 64 }
for ($x = 832; $x -lt 1216; $x += 64) { Draw-ImageNative $parkingBase.Graphics $parkingEdge $x 64 }
for ($x = 64; $x -lt 448; $x += 64) { Draw-ImageNative $parkingBase.Graphics $parkingT $x 96 }
for ($x = 832; $x -lt 1216; $x += 64) { Draw-ImageNative $parkingBase.Graphics $parkingT $x 96 }
for ($x = 64; $x -lt 448; $x += 64) { Draw-RotatedTile $parkingBase.Graphics $parkingEdge $x 928 2 }
for ($x = 832; $x -lt 1216; $x += 64) { Draw-RotatedTile $parkingBase.Graphics $parkingEdge $x 928 2 }
for ($x = 64; $x -lt 448; $x += 64) { Draw-RotatedTile $parkingBase.Graphics $parkingT $x 896 2 }
for ($x = 832; $x -lt 1216; $x += 64) { Draw-RotatedTile $parkingBase.Graphics $parkingT $x 896 2 }
Draw-ImageNative $parkingBase.Graphics $parkingCorner 64 64
Draw-RotatedTile $parkingBase.Graphics $parkingCorner 1184 64 1
Draw-ImageNative $parkingBase.Graphics $parkingDrain 320 320
Draw-ImageNative $parkingBase.Graphics $parkingDrain 896 576
Draw-ImageNative $parkingBase.Graphics $parkingDrain 448 864
Draw-ImageNative $parkingBase.Graphics $parkingDrain 800 352
Save-PixelCanvas $parkingBase $parkingMapPath

# Union the logical blocked rectangles and render one depth-sliced wall layer.
$blocked = New-Object 'bool[,]' 40, 32
foreach ($rect in $parkingBlockedRects) {
  for ($row = $rect[1]; $row -le $rect[3]; $row += 1) {
    for ($col = $rect[0]; $col -le $rect[2]; $col += 1) { $blocked[$col, $row] = $true }
  }
}

$parkingWalls = New-PixelCanvas 1280 1024
for ($row = 0; $row -lt 32; $row += 1) {
  for ($col = 0; $col -lt 40; $col += 1) {
    if (-not $blocked[$col, $row]) { continue }
    $x = $col * 32
    $y = $row * 32
    Draw-ParkingCell $parkingWalls.Graphics 39 $x $y
  }
}
for ($row = 0; $row -lt 32; $row += 1) {
  for ($col = 0; $col -lt 40; $col += 1) {
    if (-not $blocked[$col, $row]) { continue }
    $x = $col * 32
    $y = $row * 32
    $southOpen = ($row -eq 31) -or (-not $blocked[$col, ($row + 1)])
    $eastOpen = ($col -eq 39) -or (-not $blocked[($col + 1), $row])
    $westOpen = ($col -eq 0) -or (-not $blocked[($col - 1), $row])
    if ($southOpen) { Draw-ParkingCell $parkingWalls.Graphics $(44 + (($col + $row) % 2) * 3) $x $y }
    if ($eastOpen) { Draw-ParkingCell $parkingWalls.Graphics 45 $x $y }
    if ($westOpen) { Draw-ParkingCell $parkingWalls.Graphics 54 $x $y }
  }
}
Save-PixelCanvas $parkingWalls (Join-Path $buildingOutput "parking-walls-v9.png")

Write-Output (Join-Path $buildingOutput "plaza-u-continuous-v12.png")
Write-Output (Join-Path $buildingOutput "abandoned-megamall-v9.png")
Write-Output $mapPath
Write-Output (Join-Path $buildingOutput "parking-walls-v9.png")
Write-Output $parkingMapPath
