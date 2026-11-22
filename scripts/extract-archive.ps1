param(
  [Parameter(Mandatory=$true)][string]$ArchivePath,
  [Parameter(Mandatory=$true)][string]$DestinationPath
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = (Resolve-Path -LiteralPath $ArchivePath).Path
$destination = [System.IO.Path]::GetFullPath($DestinationPath)
if (Test-Path -LiteralPath $destination) { throw 'Extraction destination already exists.' }
[System.IO.Compression.ZipFile]::ExtractToDirectory($archive, $destination)
