# Baslat menusune (istenirse masaustune de) Kokpit kisayolu koyar. Tekrar calistirmak
# kisayolu gunceller. Kullanim: npm run kisayol  |  npm run kisayol -- -Masaustu
param([switch]$Masaustu)

$kok = Split-Path -Parent $PSScriptRoot
$vbs = Join-Path $kok 'scripts\kokpit-sessiz.vbs'
$ikon = Join-Path $kok 'public\kokpit.ico'
$electron = Join-Path $kok 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $vbs)) { throw "Bulunamadi: $vbs" }

$hedefler = @([Environment]::GetFolderPath('Programs'))
if ($Masaustu) { $hedefler += [Environment]::GetFolderPath('Desktop') }

$ws = New-Object -ComObject WScript.Shell
foreach ($klasor in $hedefler) {
    $lnk = Join-Path $klasor 'Kokpit.lnk'
    $k = $ws.CreateShortcut($lnk)
    $k.TargetPath = 'wscript.exe'
    $k.Arguments = '"' + $vbs + '"'
    $k.WorkingDirectory = $kok
    $k.Description = 'Kokpit - projeleri tek yuzeyden yonet'
    # Ozel ikon (npm run ikon); yoksa Electron'un kendi ikonu.
    if (Test-Path $ikon) { $k.IconLocation = "$ikon,0" }
    elseif (Test-Path $electron) { $k.IconLocation = "$electron,0" }
    $k.Save()
    Write-Host "Kisayol yazildi: $lnk"
}
