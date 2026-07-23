param(
  [string]$SourceDir = "",
  [string]$OutputDir = "",
  [string]$Manifest = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

throw @"
The flat legacy-to-overworld normalizer is retired. The approved 384x512
6x8 sheets in assets/sprites/npcs/overworld/{entity-slug}/overworld.png are
canonical and must not be rebuilt from legacy-4x4 sources.

To refresh metadata after relocating an already-approved sheet without
changing its pixels, run:
  node tools/build-npc-asset-catalog.mjs

Any artistic regeneration must follow the repository PixelLab MCP workflow.
"@
