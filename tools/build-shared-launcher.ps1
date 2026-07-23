[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $repoRoot 'shared-launcher\Program.cs'
$outputPath = Join-Path $repoRoot 'PokemonAdventureCompartido.exe'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path -LiteralPath $compiler)) {
    throw "No se encontró el compilador de Windows en $compiler"
}

if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "No se encontró el código fuente en $sourcePath"
}

$compilerArguments = @(
    '/nologo'
    '/target:winexe'
    '/platform:anycpu'
    '/optimize+'
    "/out:$outputPath"
    '/reference:System.dll'
    '/reference:System.Core.dll'
    '/reference:System.Drawing.dll'
    '/reference:System.Windows.Forms.dll'
    $sourcePath
)

& $compiler @compilerArguments
if ($LASTEXITCODE -ne 0) {
    throw "La compilación terminó con el código $LASTEXITCODE"
}

$result = Get-Item -LiteralPath $outputPath
Write-Host "Ejecutable creado: $($result.FullName)"
Write-Host "Tamaño: $([Math]::Round($result.Length / 1KB, 1)) KB"
