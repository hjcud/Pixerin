param(
  [Parameter(Mandatory = $true)][string]$ExecutablePath,
  [Parameter(Mandatory = $true)][string]$IconPath,
  [Parameter(Mandatory = $true)][string]$ResourcePlanPath
)
$ErrorActionPreference = 'Stop'
# Build-time Windows APIs only; no downloaded icon editor is shipped or required.
Add-Type @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
public static class PixerinIconResources {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr BeginUpdateResourceW(string file, bool deleteExisting);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool UpdateResourceW(IntPtr handle, IntPtr type, IntPtr name, ushort language, byte[] data, uint size);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool EndUpdateResourceW(IntPtr handle, bool discard);
  public static void Update(IntPtr handle, int type, int name, ushort language, byte[] data) {
    if (!UpdateResourceW(handle, (IntPtr)type, (IntPtr)name, language, data, data == null ? 0 : (uint)data.Length))
      throw new Win32Exception(Marshal.GetLastWin32Error());
  }
  public static void AddIcon(IntPtr handle, byte[] ico) {
    if (BitConverter.ToUInt16(ico, 0) != 0 || BitConverter.ToUInt16(ico, 2) != 1)
      throw new InvalidDataException("Expected ICO data");
    int count = BitConverter.ToUInt16(ico, 4);
    using (var stream = new MemoryStream()) {
      using (var writer = new BinaryWriter(stream)) {
        writer.Write((ushort)0); writer.Write((ushort)1); writer.Write((ushort)count);
        for (int i = 0; i < count; i++) {
          int at = 6 + i * 16;
          int size = checked((int)BitConverter.ToUInt32(ico, at + 8));
          int start = checked((int)BitConverter.ToUInt32(ico, at + 12));
          var frame = new byte[size]; Array.Copy(ico, start, frame, 0, size);
          Update(handle, 3, i + 1, 1033, frame);
          writer.Write(ico, at, 12); writer.Write((ushort)(i + 1));
        }
        writer.Flush();
        Update(handle, 14, 1, 1033, stream.ToArray());
      }
    }
  }
}
'@
$pixelExe = (Resolve-Path -LiteralPath $ExecutablePath).Path
$pixelIcon = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $IconPath).Path)
$pixelPlan = Get-Content -LiteralPath $ResourcePlanPath -Raw | ConvertFrom-Json
foreach ($entry in $pixelPlan) {
  if ($entry.type -notin @(3, 14) -or $entry.name -is [string] -or $entry.name -lt 1 -or $entry.name -gt 65535) {
    throw 'Only numeric icon resources may be replaced.'
  }
}
$pixelHandle = [PixerinIconResources]::BeginUpdateResourceW($pixelExe, $false)
if ($pixelHandle -eq [IntPtr]::Zero) { throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error()) }
$pixelFinished = $false
try {
  foreach ($entry in $pixelPlan) {
    [PixerinIconResources]::Update($pixelHandle, $entry.type, $entry.name, $entry.language, $null)
  }
  [PixerinIconResources]::AddIcon($pixelHandle, $pixelIcon)
  if (-not [PixerinIconResources]::EndUpdateResourceW($pixelHandle, $false)) {
    throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error())
  }
  $pixelFinished = $true
} finally {
  if (-not $pixelFinished) { [void][PixerinIconResources]::EndUpdateResourceW($pixelHandle, $true) }
}
