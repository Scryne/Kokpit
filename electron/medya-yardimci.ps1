# v4.0 medya yardimcisi: Windows'un medya oturumunu (GlobalSystemMediaTransportControlsSessionManager)
# okur, stdout'a satir basina tek JSON yazar, stdin'den komut alir. electron/medya.cjs yonetir.
#
# Neden Windows PowerShell 5.1 (powershell.exe): WinRT projeksiyonu ([..., ContentType = WindowsRuntime])
# pwsh 7'de yok; Node'dan WinRT'ye bagimliliksiz baska yol da yok.
#
# Protokol (stdout, UTF-8 BOM'suz):
#   {"tur":"hazir"}                                   acilista bir kez
#   {"tur":"durum", ...}                              degisiklikte ve en gec 5 sn'de bir
#   {"tur":"kapak","kimlik":..,"mime":..,"veri":..}   parca degisince bir kez (yoksa / 400 KB ustu: null)
#   {"tur":"yok"}                                     oturum yokken (durum degisince bir kez)
#   {"tur":"hata","mesaj":..}                         kurtarilabilir hata (dongu surer)
# stdin: oynat-duraklat | sonraki | onceki | cik. stdin EOF -> cikis: ebeveyn olunce yetim kalmamak icin.

$ErrorActionPreference = 'Stop'

# Kendi yazicimiz: [Console]::Out kodlamasi ortama gore degisebiliyor; Turkce baslik bozulmasin.
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
$script:cikis = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), (New-Object System.Text.UTF8Encoding($false)))
$script:cikis.AutoFlush = $true
$script:cikis.NewLine = "`n"

function Yaz($nesne) {
  $metin = ConvertTo-Json -InputObject $nesne -Compress -Depth 3
  try {
    $script:cikis.WriteLine($metin)
  } catch {
    # stdout borusu kapandi: ebeveyn yok, yapacak is kalmadi.
    exit 0
  }
}

$script:sonHata = ''
function HataYaz([string]$mesaj) {
  # Ayni hata her saniye tekrar etmesin (oturum kapanirken birkac yoklama ayni hatayi verir).
  if ($mesaj -eq $script:sonHata) { return }
  $script:sonHata = $mesaj
  Yaz ([ordered]@{ tur = 'hata'; mesaj = $mesaj })
}

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $script:asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
  [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
  [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
  [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
  # AsStreamForRead bir uzanti metodu; PowerShell bunu WinRT nesnesinde dogrudan cagiramiyor (spike).
  $script:akisCevir = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))
} catch {
  Yaz ([ordered]@{ tur = 'hata'; mesaj = 'WinRT yuklenemedi: ' + $_.Exception.Message })
  exit 2
}

# Yansitma pahali: her tur icin genel metot bir kez uretilir (yoklama her saniye calisiyor).
$script:asTaskTur = @{}
function Bekle($is, [Type]$tur) {
  $m = $script:asTaskTur[$tur]
  if (-not $m) {
    $m = $script:asTask.MakeGenericMethod($tur)
    $script:asTaskTur[$tur] = $m
  }
  $gorev = $m.Invoke($null, @($is))
  if (-not $gorev.Wait(5000)) { throw 'WinRT cagrisi 5 sn icinde donmedi' }
  $gorev.Result
}

try {
  $script:yonetici = Bekle ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
} catch {
  Yaz ([ordered]@{ tur = 'hata'; mesaj = 'medya yoneticisi alinamadi: ' + $_.Exception.Message })
  exit 2
}

# stdin'i [Console]::In ile degil kendi okuyucumuzla oku: SyncTextReader.ReadLineAsync esitzamanli
# calisip donguyu kilitler; StreamReader.ReadLineAsync okumayi havuz is parcaciginda bekletir.
$script:girdi = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), (New-Object System.Text.UTF8Encoding($false)))
$script:okuma = $script:girdi.ReadLineAsync()

$script:oturum = $null
$script:sonAnahtar = $null      # parca + durum + kontroller
$script:sonKonum = 0             # son yazilan durumun konumu (o anki tahmini, ms)
$script:sonYazim = [DateTime]::MinValue
$script:sonYok = $false
$script:kapakKimlik = $null
$script:kapakDeneme = 0          # kapak bazen parcadan bir iki yoklama sonra geliyor
$script:sha1 = [System.Security.Cryptography.SHA1]::Create()

function Ozet([string]$metin) {
  $b = $script:sha1.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($metin))
  [BitConverter]::ToString($b, 0, 8).Replace('-', '').ToLowerInvariant()
}

function OturumSec {
  $s = $script:yonetici.GetCurrentSession()
  $calan = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing
  if ($s -and $s.GetPlaybackInfo().PlaybackStatus -eq $calan) { return $s }
  # "Gecerli" oturum duraklatilmis bir sekme olabilir; baska bir uygulama caliyorsa o daha anlamli.
  foreach ($o in $script:yonetici.GetSessions()) {
    try {
      if ($o.GetPlaybackInfo().PlaybackStatus -eq $calan) { return $o }
    } catch { }
  }
  return $s
}

function KapakOku($ozellik) {
  if (-not $ozellik.Thumbnail) { return $null }
  $akis = Bekle ($ozellik.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  try {
    $mime = [string]$akis.ContentType
    if (-not $mime) { $mime = 'image/jpeg' }
    # Boyut once sorulur: 400 KB ustu kapak hic kopyalanmaz.
    if ($akis.Size -gt 400KB) { return @{ mime = $mime; veri = $null; buyuk = $true } }
    $ns = $script:akisCevir.Invoke($null, @($akis))
    $ms = New-Object System.IO.MemoryStream
    $ns.CopyTo($ms)
    if ($ms.Length -eq 0) { return $null }
    if ($ms.Length -gt 400KB) { return @{ mime = $mime; veri = $null; buyuk = $true } }
    return @{ mime = $mime; veri = [Convert]::ToBase64String($ms.ToArray()) }
  } finally {
    try { $akis.Dispose() } catch { }
  }
}

function Yokla {
  $s = OturumSec
  $script:oturum = $s
  if (-not $s) {
    if (-not $script:sonYok) {
      Yaz ([ordered]@{ tur = 'yok' })
      $script:sonYok = $true
      $script:sonAnahtar = $null
      $script:kapakKimlik = $null
    }
    return
  }
  $p = Bekle ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $z = $s.GetTimelineProperties()
  $d = $s.GetPlaybackInfo()
  $simdi = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

  $baslik = [string]$p.Title
  $sanatci = [string]$p.Artist
  $album = [string]$p.AlbumTitle
  $uygulama = [string]$s.SourceAppUserModelId
  $caliyor = ($d.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing)
  $c = $d.Controls
  $konum = [int64]$z.Position.TotalMilliseconds
  $sure = [int64]($z.EndTime.TotalMilliseconds - $z.StartTime.TotalMilliseconds)
  if ($sure -lt 0) { $sure = 0 }
  $guncel = [int64]0
  try { $guncel = $z.LastUpdatedTime.ToUnixTimeMilliseconds() } catch { $guncel = 0 }
  if ($guncel -lt 0) { $guncel = 0 }
  $kimlik = Ozet ($baslik + "`n" + $sanatci + "`n" + $album)

  # Konum sicramasi: son yazilan konum o andan beri calmaya devam ettiyse nerede olmaliydi?
  $simdikiKonum = $konum
  if ($caliyor -and $guncel -gt 0 -and $guncel -le $simdi) { $simdikiKonum = $konum + ($simdi - $guncel) }
  $gecen = [int64]([DateTime]::UtcNow - $script:sonYazim).TotalMilliseconds
  $beklenen = $script:sonKonum
  if ($caliyor) { $beklenen = $script:sonKonum + $gecen }
  $sicrama = [Math]::Abs($simdikiKonum - $beklenen) -gt 2000

  $anahtar = $uygulama + '|' + $kimlik + '|' + $caliyor + '|' + $sure + '|' + $c.IsPlayEnabled + $c.IsPauseEnabled + $c.IsNextEnabled + $c.IsPreviousEnabled
  if ($anahtar -ne $script:sonAnahtar -or $sicrama -or $gecen -ge 5000) {
    Yaz ([ordered]@{
        tur        = 'durum'
        uygulama   = $uygulama
        baslik     = $baslik
        sanatci    = $sanatci
        album      = $album
        caliyor    = $caliyor
        konumMs    = $konum
        sureMs     = $sure
        guncelMs   = $guncel
        oynat      = [bool]($c.IsPlayEnabled -or $c.IsPauseEnabled -or $c.IsPlayPauseToggleEnabled)
        sonraki    = [bool]$c.IsNextEnabled
        onceki     = [bool]$c.IsPreviousEnabled
        kapakKimlik = $kimlik
      })
    $script:sonAnahtar = $anahtar
    $script:sonKonum = $simdikiKonum
    $script:sonYazim = [DateTime]::UtcNow
    $script:sonYok = $false
  }

  if ($kimlik -ne $script:kapakKimlik) {
    $script:kapakKimlik = $kimlik
    $script:kapakDeneme = 0
  }
  if ($script:kapakDeneme -ge 0) {
    $script:kapakDeneme++
    $k = $null
    try { $k = KapakOku $p } catch { $k = $null }
    if ($k) {
      Yaz ([ordered]@{ tur = 'kapak'; kimlik = $kimlik; mime = $k.mime; veri = $k.veri })
      $script:kapakDeneme = -1
    } elseif ($script:kapakDeneme -ge 3) {
      Yaz ([ordered]@{ tur = 'kapak'; kimlik = $kimlik; mime = 'image/jpeg'; veri = $null })
      $script:kapakDeneme = -1
    }
  }
}

function Komut([string]$k) {
  $s = $script:oturum
  if (-not $s) { return }
  try {
    switch ($k) {
      'oynat-duraklat' { Bekle ($s.TryTogglePlayPauseAsync()) ([bool]) | Out-Null }
      'sonraki' { Bekle ($s.TrySkipNextAsync()) ([bool]) | Out-Null }
      'onceki' { Bekle ($s.TrySkipPreviousAsync()) ([bool]) | Out-Null }
    }
  } catch {
    HataYaz ('komut basarisiz (' + $k + '): ' + $_.Exception.Message)
  }
}

Yaz ([ordered]@{ tur = 'hazir' })

$sonrakiYoklama = [DateTime]::MinValue
while ($true) {
  if ([DateTime]::UtcNow -ge $sonrakiYoklama) {
    try {
      Yokla
      $script:sonHata = ''
    } catch {
      $script:oturum = $null
      HataYaz ('yoklama: ' + $_.Exception.Message)
    }
    $sonrakiYoklama = [DateTime]::UtcNow.AddMilliseconds(1000)
  }
  $kalan = [int]([Math]::Max(0, ($sonrakiYoklama - [DateTime]::UtcNow).TotalMilliseconds))
  # Bekleme stdin gorevi uzerinden: komut gelirse hemen uyanilir, yoksa bir sonraki yoklamaya kadar uyunur.
  $hazir = $false
  try {
    $hazir = $script:okuma.Wait($kalan)
  } catch {
    exit 0 # okuma bozuldu: boru kapanmis sayilir
  }
  if (-not $hazir) { continue }
  $satir = $script:okuma.Result
  if ($null -eq $satir) { exit 0 } # EOF: ebeveyn oldu ya da stdin kapatildi
  $satir = $satir.Trim()
  if ($satir -eq 'cik') { exit 0 }
  if ($satir -eq 'oynat-duraklat' -or $satir -eq 'sonraki' -or $satir -eq 'onceki') {
    Komut $satir
    # Durum hemen yansisin (uygulama komutu ~yuz ms icinde isler).
    $sonrakiYoklama = [DateTime]::UtcNow.AddMilliseconds(250)
  }
  $script:okuma = $script:girdi.ReadLineAsync()
}
