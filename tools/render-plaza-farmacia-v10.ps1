param(
  [string]$OutputPath = "",
  [string]$PlazaOutputPath = "",
  [string]$RuinOutputPath = ""
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $repoRoot "artifacts\plaza-farmacia-overview-v10.png"
} elseif (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath = Join-Path $repoRoot $OutputPath
}
if ([string]::IsNullOrWhiteSpace($PlazaOutputPath)) {
  $PlazaOutputPath = Join-Path $repoRoot "artifacts\plaza-farmacia-plaza-v10.png"
} elseif (-not [System.IO.Path]::IsPathRooted($PlazaOutputPath)) {
  $PlazaOutputPath = Join-Path $repoRoot $PlazaOutputPath
}
if ([string]::IsNullOrWhiteSpace($RuinOutputPath)) {
  $RuinOutputPath = Join-Path $repoRoot "artifacts\plaza-farmacia-ruina-v10.png"
} elseif (-not [System.IO.Path]::IsPathRooted($RuinOutputPath)) {
  $RuinOutputPath = Join-Path $repoRoot $RuinOutputPath
}

function Ensure-OutputDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)

  $directory = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
}

function Resolve-RepoAsset {
  param([Parameter(Mandatory = $true)][string]$RelativePath)

  $path = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "No se encontro el asset requerido: $path"
  }
  return (Resolve-Path -LiteralPath $path).Path
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

    # Los placements del runtime usan centro inferior, no esquina superior.
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

$basePath = Resolve-RepoAsset "maps\plaza-farmacia\base-v10.png"
$base = [System.Drawing.Bitmap]::FromFile($basePath)
try {
  if ($base.Width -ne 1280 -or $base.Height -ne 1792) {
    throw "base-v10.png debe medir 1280x1792; mide $($base.Width)x$($base.Height)."
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

      # Estructura comercial unica en U, al fondo de todos los elementos de plaza.
      Draw-AnchoredSprite $graphics `
        "assets\generated\plaza-farmacia-pixellab\runtime-v10\buildings\plaza-u-continuous-v10.png" `
        640 800 1088 672

      # Elementos estructurales del aparcamiento bajo la plaza.
      Draw-AnchoredSprite $graphics `
        "assets\generated\plaza-farmacia-pixellab\runtime-v10\props\parking-lightwell-high.png" `
        640 540 192 192
      Draw-AnchoredSprite $graphics `
        "assets\generated\plaza-farmacia-pixellab\runtime-v10\props\parking-portal-exterior-wide.png" `
        640 736 224 128

      # Marcadores comerciales apoyados en los umbrales interiores.
      Draw-AnchoredSprite $graphics `
        "assets\generated\plaza-farmacia-pixellab\runtime-v10\props\shop-chino-marker.png" `
        382 428 64 64
      Draw-AnchoredSprite $graphics `
        "assets\generated\plaza-farmacia-pixellab\runtime-v10\props\shop-seafood-marker.png" `
        382 748 64 64
      Draw-AnchoredSprite $graphics `
        "assets\generated\plaza-farmacia-pixellab\runtime-v10\props\shop-fruit-marker.png" `
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

      # Solar sur: volumen enorme primero, entrada superpuesta y valla en primer plano.
      Draw-AnchoredSprite $graphics `
        "assets\generated\plaza-farmacia-pixellab\runtime-v10\buildings\abandoned-megamall-v9.png" `
        640 1792 1152 512
      Draw-AnchoredSprite $graphics `
        "assets\generated\plaza-farmacia-pixellab\runtime-v10\buildings\abandoned-megamall-entrance-v9.png" `
        640 1584 256 256

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

    # Recortes 1:1 del canvas final: no hay interpolacion ni pixels nuevos.
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

Confirm-ImageDimensions $OutputPath 1280 1792 "Render v10"
Confirm-ImageDimensions $PlazaOutputPath 1280 1120 "Recorte plaza v10"
Confirm-ImageDimensions $RuinOutputPath 1280 704 "Recorte ruina v10"
