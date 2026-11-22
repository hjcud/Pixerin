param(
  [Parameter(Mandatory=$true)][string]$SourcePath,
  [Parameter(Mandatory=$true)][string]$ArchivePath
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$source = (Resolve-Path -LiteralPath $SourcePath).Path
$target = [System.IO.Path]::GetFullPath($ArchivePath)
if (Test-Path -LiteralPath $target) { throw 'Archive destination already exists.' }
[System.IO.Compression.ZipFile]::CreateFromDirectory($source, $target, [System.IO.Compression.CompressionLevel]::Optimal, $true)
