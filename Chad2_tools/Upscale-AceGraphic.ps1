<#
  Upscales VX Ace graphics for RPG Maker MV (32px grid -> 48px grid, i.e. x1.5)
  using nearest-neighbour sampling so pixel art stays crisp.

  Usage:
    .\Upscale-AceGraphic.ps1 -Source <file or folder> -Destination <folder> [-Scale 1.5]

  Examples:
    # One character sheet from the Ace project into the MV project
    .\Upscale-AceGraphic.ps1 -Source "..\Chad2_VX_ACE\Graphics\Characters\Robbie.png" -Destination "..\Chad2_MV\img\characters"

    # Ace RTP files (after installing the VX Ace RTP), e.g. People5
    .\Upscale-AceGraphic.ps1 -Source "C:\Program Files (x86)\Common Files\Enterbrain\RGSS3\RPGVXAce\Graphics\Characters\People5.png" -Destination "..\Chad2_MV\img\characters"

  Output files are always written with a lowercase ".png" extension.
  Existing files in the destination are NOT overwritten unless -Force is given.
#>
param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [double]$Scale = 1.5,
    [switch]$Force
)

Add-Type -AssemblyName System.Drawing

function Convert-One([string]$inPath, [string]$outDir) {
    $name = [System.IO.Path]::GetFileNameWithoutExtension($inPath)
    $outPath = Join-Path $outDir ($name + '.png')
    if ((Test-Path -LiteralPath $outPath) -and -not $Force) {
        Write-Host "skip (exists): $outPath"
        return
    }
    $src = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $inPath).Path)
    try {
        $w = [int][Math]::Round($src.Width * $Scale)
        $h = [int][Math]::Round($src.Height * $Scale)
        $dst = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $g = [System.Drawing.Graphics]::FromImage($dst)
            try {
                $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
                $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
                $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
                $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
                $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $w, $h)))
            } finally { $g.Dispose() }
            $dst.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
            Write-Host ("{0} ({1}x{2}) -> {3} ({4}x{5})" -f $inPath, $src.Width, $src.Height, $outPath, $w, $h)
        } finally { $dst.Dispose() }
    } finally { $src.Dispose() }
}

if (-not (Test-Path -LiteralPath $Destination)) { New-Item -ItemType Directory -Path $Destination | Out-Null }

if (Test-Path -LiteralPath $Source -PathType Container) {
    Get-ChildItem -LiteralPath $Source -File | Where-Object { $_.Extension -match '^\.png$' } |
        ForEach-Object { Convert-One $_.FullName $Destination }
} else {
    Convert-One $Source $Destination
}
