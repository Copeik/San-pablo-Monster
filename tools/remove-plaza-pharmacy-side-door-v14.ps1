param(
  [string]$SourcePath = "assets/references/plaza-farmacia-final-authoritative-with-side-door-v1.png",
  [string]$OutputPath = "assets/references/plaza-farmacia-final-authoritative.png"
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

$sourceFile = Resolve-ProjectPath $SourcePath
$outputFile = Resolve-ProjectPath $OutputPath

if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
  throw "No existe la referencia original: $sourceFile"
}

$source = [System.Drawing.Bitmap]::FromFile($sourceFile)
try {
  if ($source.Width -ne 1060 -or $source.Height -ne 1484) {
    throw "La referencia debe medir 1060x1484; mide $($source.Width)x$($source.Height)."
  }

  $result = $source.Clone(
    [System.Drawing.Rectangle]::new(0, 0, $source.Width, $source.Height),
    [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
  )
  try {
    # El saliente ocupaba el lateral de la farmacia. Se sustituye la columna
    # completa de acera de la plaza por la columna contigua, desplazada
    # exactamente 53 px (dos módulos de 26,5 px en la referencia). Así las
    # juntas continúan fuera del antiguo recuadro sin dejar una costura.
    $sidewalkPatch = $source.Clone(
      [System.Drawing.Rectangle]::new(985, 0, 60, 835),
      [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
    )
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($result)
      try {
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.DrawImageUnscaled($sidewalkPatch, 932, 0)
      } finally {
        $graphics.Dispose()
      }
    } finally {
      $sidewalkPatch.Dispose()
    }

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputFile) | Out-Null
    $result.Save($outputFile, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $result.Dispose()
  }
} finally {
  $source.Dispose()
}

Write-Output $outputFile
