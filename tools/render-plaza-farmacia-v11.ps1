param(
  [string]$OutputPath = "",
  [string]$PlazaOutputPath = "",
  [string]$RuinOutputPath = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot

function Resolve-OutputPath {
  param([string]$Path, [string]$DefaultRelativePath)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return Join-Path $repoRoot $DefaultRelativePath
  }
  if ([System.IO.Path]::IsPathRooted($Path)) { return $Path }
  return Join-Path $repoRoot $Path
}

$OutputPath = Resolve-OutputPath $OutputPath "artifacts\plaza-farmacia-overview-v11.png"
$PlazaOutputPath = Resolve-OutputPath $PlazaOutputPath "artifacts\plaza-farmacia-plaza-v11.png"
$RuinOutputPath = Resolve-OutputPath $RuinOutputPath "artifacts\plaza-farmacia-ruina-v11.png"

function Resolve-RepoAsset {
  param([Parameter(Mandatory = $true)][string]$RelativePath)

  $path = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "No se encontro el asset requerido: $path"
  }
  return (Resolve-Path -LiteralPath $path).Path
}

function Ensure-OutputDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)

  $directory = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
}

function Draw-AnchoredSprite {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Graphics]$Graphics,
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][int]$AnchorX,
    [Parameter(Mandatory = $true)][int]$AnchorY,
    [Parameter(Mandatory = $true)][int]$Width,
    [Parameter(Mandatory = $true)][int]$Height,
    [switch]$FlipX
  )

  $sourcePath = Resolve-RepoAsset $RelativePath
  $source = [System.Drawing.Bitmap]::FromFile($sourcePath)
  try {
    if ($FlipX) {
      $source.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX)
    }

    # Igual que el runtime: x es el centro y y es la base del sprite.
    $left = [int][Math]::Round($AnchorX - ($Width / 2.0), [MidpointRounding]::AwayFromZero)
    $top = $AnchorY - $Height
    $destination = [System.Drawing.Rectangle]::new($left, $top, $Width, $Height)
    $Graphics.DrawImage(
      $source,
      $destination,
      0,
      0,
      $source.Width,
      $source.Height,
      [System.Drawing.GraphicsUnit]::Pixel
    )
  } finally {
    $source.Dispose()
  }
}

function Confirm-ImageDimensions {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][int]$ExpectedWidth,
    [Parameter(Mandatory = $true)][int]$ExpectedHeight,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $image = [System.Drawing.Image]::FromFile($Path)
  try {
    if ($image.Width -ne $ExpectedWidth -or $image.Height -ne $ExpectedHeight) {
      throw "$Label debe medir ${ExpectedWidth}x${ExpectedHeight}; mide $($image.Width)x$($image.Height)."
    }
    Write-Output "$Label`: $Path"
    Write-Output "Dimensiones: $($image.Width)x$($image.Height)"
  } finally {
    $image.Dispose()
  }
}

$basePath = Resolve-RepoAsset "maps\plaza-farmacia\base-v11.png"
$base = [System.Drawing.Bitmap]::FromFile($basePath)
try {
  if ($base.Width -ne 1280 -or $base.Height -ne 1792) {
    throw "base-v11.png debe medir 1280x1792; mide $($base.Width)x$($base.Height)."
  }

  $canvas = [System.Drawing.Bitmap]::new(1280, 1792, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    try {
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None

      $graphics.DrawImageUnscaled($base, 0, 0)

      # U comercial v11 completa, con el mismo anclaje contractual del mapa.
      Draw-AnchoredSprite $graphics `
        "assets\generated\plaza-farmacia-pixellab\runtime-v11\buildings\plaza-u-continuous-v11.png" `
        640 800 1088 672

      Draw-AnchoredSprite $graphics `
        "assets\generated\plaza-farmacia-pixellab\runtime-v11\props\parking-lightwell-high.png" `
        640 540 192 192
      Draw-AnchoredSprite $graphics `
        "assets\generated\plaza-farmacia-pixellab\runtime-v11\props\parking-ramp-shared-320x160.png" `
        640 736 320 160

      Draw-AnchoredSprite $graphics `
        "assets\generated\plaza-farmacia-pixellab\runtime-v11\props\shop-chino-marker.png" `
        382 428 64 64
      Draw-AnchoredSprite $graphics `
        "assets\generated\plaza-farmacia-pixellab\runtime-v11\props\shop-seafood-marker.png" `
        382 748 64 64
      Draw-AnchoredSprite $graphics `
        "assets\generated\plaza-farmacia-pixellab\runtime-v11\props\shop-fruit-marker.png" `
        898 428 64 64

      $tablePlacements = @(
        @(450, 430), @(510, 430), @(450, 480), @(510, 480),
        @(770, 430), @(830, 430), @(770, 480), @(830, 480),
        @(450, 650), @(480, 720), @(800, 650), @(830, 720)
      )
      foreach ($placement in $tablePlacements) {
        Draw-AnchoredSprite $graphics `
          "assets\generated\san-pablo-barrio-c-pixellab\runtime\props\cafe-table-chairs.png" `
          $placement[0] $placement[1] 60 33
      }

      Draw-AnchoredSprite $graphics `
        "assets\generated\san-pablo-derived\runtime\prop-park-bench.png" `
        450 786 76 44
      Draw-AnchoredSprite $graphics `
        "assets\generated\san-pablo-derived\runtime\prop-park-bench.png" `
        830 786 76 44 -FlipX
      Draw-AnchoredSprite $graphics `
        "assets\generated\san-pablo-derived\runtime\prop-streetlamp.png" `
        400 820 28 72
      Draw-AnchoredSprite $graphics `
        "assets\generated\san-pablo-derived\runtime\prop-streetlamp.png" `
        880 820 28 72

      # El megacentro v11 ya integra su gran entrada/atrio central.
      Draw-AnchoredSprite $graphics `
        "assets\generated\plaza-farmacia-pixellab\runtime-v11\buildings\abandoned-megamall-v11.png" `
        640 1792 1152 512

      foreach ($x in @(160, 480, 800, 1120)) {
        Draw-AnchoredSprite $graphics `
          "assets\generated\plaza-farmacia-pixellab\prop-gray-metal-fence.png" `
          $x 1216 320 96
      }
      for ($index = 0; $index -lt 9; $index += 1) {
        $y = 1280 + ($index * 64)
        Draw-AnchoredSprite $graphics `
          "assets\generated\ada-efeso-pixellab\props\fence-topdown-vertical.png" `
          64 $y 64 64
        Draw-AnchoredSprite $graphics `
          "assets\generated\ada-efeso-pixellab\props\fence-topdown-vertical.png" `
          1216 $y 64 64
      }
      for ($index = 0; $index -lt 18; $index += 1) {
        $x = 96 + ($index * 64)
        Draw-AnchoredSprite $graphics `
          "assets\generated\ada-efeso-pixellab\props\fence-topdown-horizontal.png" `
          $x 1792 64 64
      }
    } finally {
      $graphics.Dispose()
    }

    Ensure-OutputDirectory $OutputPath
    Ensure-OutputDirectory $PlazaOutputPath
    Ensure-OutputDirectory $RuinOutputPath
    $canvas.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    # Recortes exactos 1:1 del canvas final, sin reescalado.
    $plazaCrop = $canvas.Clone(
      [System.Drawing.Rectangle]::new(0, 0, 1280, 1120),
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    try {
      $plazaCrop.Save($PlazaOutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $plazaCrop.Dispose()
    }

    $ruinCrop = $canvas.Clone(
      [System.Drawing.Rectangle]::new(0, 1088, 1280, 704),
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    try {
      $ruinCrop.Save($RuinOutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $ruinCrop.Dispose()
    }
  } finally {
    $canvas.Dispose()
  }
} finally {
  $base.Dispose()
}

Confirm-ImageDimensions $OutputPath 1280 1792 "Render v11"
Confirm-ImageDimensions $PlazaOutputPath 1280 1120 "Recorte plaza v11"
Confirm-ImageDimensions $RuinOutputPath 1280 704 "Recorte ruina v11"
