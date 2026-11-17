<#
.SYNOPSIS
  Basiz bir Claude Code sureci (claude -p) baslatir; ortami yalniz o cocuk surec icin
  Kokpit'in model saglayicisina (opencode / ozel / deepseek) cevirir.

.DESCRIPTION
  Kokpit terminal sekmelerinin yaptigi ortam eslemesinin komut satiri karsiligi
  (bkz. electron/saglayici.cjs ortam(), electron/pty-server.cjs temizOrtam()).
  Saglayici bilgisi ~/.kokpit/saglayici.json (KOKPIT_DIZIN varsa o dizin). Anahtar calisma
  aninda okunur, yalniz cocuk surecin ortamina konur; arguman, ozet, cikti ve hata dosyasina girmez.

  Cikis kodlari: claude'un kodu | 2 ayar dosyasi okunamadi | 3 anahtarli saglayici yok
  | 4 brif/dizin/parametre eksik | 5 claude bulunamadi

.EXAMPLE
  pwsh -File scripts/ds-isci.ps1 -Kuru
  pwsh -File scripts/ds-isci.ps1 -Brif brif.md -Dizin C:\repo -Cikti cikti.json -Efor medium
#>
[CmdletBinding()]
param(
  [string]$Brif,
  [string]$Dizin,
  [string]$Cikti,
  [ValidateSet('opencode', 'ozel', 'deepseek')][string]$Saglayici,
  [ValidateSet('low', 'medium', 'high', 'xhigh', 'max')][string]$Efor,
  [string[]]$IzinliAraclar,
  [switch]$Kuru
)

$ErrorActionPreference = 'Stop'

function Bitir([int]$Kod, [string]$Mesaj) {
  [Console]::Error.WriteLine("ds-isci: $Mesaj")
  exit $Kod
}

# --- Ayar dosyasi -------------------------------------------------------------------------
$ayarDizin = if ($env:KOKPIT_DIZIN) { $env:KOKPIT_DIZIN } else { Join-Path $HOME '.kokpit' }
$ayarYolu = Join-Path $ayarDizin 'saglayici.json'
if (-not (Test-Path -LiteralPath $ayarYolu -PathType Leaf)) {
  Bitir 2 "ayar dosyasi yok: $ayarYolu (Kokpit > Ayarlar'dan saglayici kaydet)"
}
try {
  $ayar = Get-Content -LiteralPath $ayarYolu -Raw -Encoding utf8 | ConvertFrom-Json
} catch {
  # Hata metni dosya icerigini aktarabilir; yalniz sabit mesaj.
  Bitir 2 "ayar dosyasi okunamadi veya gecerli JSON degil: $ayarYolu"
}

function Kayit([string]$Ad) {
  if ($null -eq $ayar.saglayicilar) { return $null }
  $p = $ayar.saglayicilar.PSObject.Properties[$Ad]
  if ($null -eq $p) { return $null }
  return $p.Value
}
function Dolu($Deger) { return -not [string]::IsNullOrWhiteSpace([string]$Deger) }

# --- Saglayici secimi ---------------------------------------------------------------------
$secilenAd = $null
$secilen = $null
if ($Saglayici) {
  $secilenAd = $Saglayici
  $secilen = Kayit $Saglayici
} else {
  foreach ($ad in 'opencode', 'ozel', 'deepseek') {
    $k = Kayit $ad
    if ($k -and (Dolu $k.anahtar) -and (Dolu $k.baseUrl)) { $secilenAd = $ad; $secilen = $k; break }
  }
}
if (-not $secilen) {
  if ($Saglayici) { Bitir 3 "'$Saglayici' ayar dosyasinda tanimli degil." }
  Bitir 3 'anahtari ve baseUrl dolu saglayici yok (opencode, ozel, deepseek denendi).'
}

$model = [string]$secilen.model
$hafif = if (Dolu $secilen.hafifModel) { [string]$secilen.hafifModel } else { $model }
$alt = if (Dolu $secilen.altModel) { [string]$secilen.altModel } else { $hafif }
$baseUrl = [string]$secilen.baseUrl
$anahtar = [string]$secilen.anahtar
$anahtarVar = Dolu $anahtar

if ($Kuru) {
  Write-Output "saglayici=$secilenAd"
  Write-Output "baseUrl=$baseUrl"
  Write-Output "model=$model"
  Write-Output "hafifModel=$hafif"
  Write-Output "altModel=$alt"
  Write-Output "anahtarVar=$anahtarVar"
  exit 0
}

# --- Dogrulamalar -------------------------------------------------------------------------
if (-not $Brif -or -not $Dizin -or -not $Cikti) { Bitir 4 '-Brif, -Dizin ve -Cikti zorunlu (-Kuru haric).' }
$yol = $ExecutionContext.SessionState.Path
$brifYolu = $yol.GetUnresolvedProviderPathFromPSPath($Brif)
$dizinYolu = $yol.GetUnresolvedProviderPathFromPSPath($Dizin)
$ciktiYolu = $yol.GetUnresolvedProviderPathFromPSPath($Cikti)
if (-not (Test-Path -LiteralPath $brifYolu -PathType Leaf)) { Bitir 4 "brif dosyasi yok: $brifYolu" }
if (-not (Test-Path -LiteralPath $dizinYolu -PathType Container)) { Bitir 4 "calisma dizini yok: $dizinYolu" }
if (-not $anahtarVar) { Bitir 3 "'$secilenAd' icin anahtar bos." }
if (-not (Dolu $baseUrl)) { Bitir 3 "'$secilenAd' icin baseUrl bos." }
if (-not (Dolu $model)) { Bitir 3 "'$secilenAd' icin model bos." }
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { Bitir 5 "'claude' komutu PATH'te bulunamadi." }

$ciktiDizin = Split-Path -Parent $ciktiYolu
if ($ciktiDizin -and -not (Test-Path -LiteralPath $ciktiDizin)) { New-Item -ItemType Directory -Path $ciktiDizin -Force | Out-Null }
$hataYolu = "$ciktiYolu.err"

# --- Arguman listesi ----------------------------------------------------------------------
if (-not $IzinliAraclar -or $IzinliAraclar.Count -eq 0) {
  # 'npm run *' bilerek YOK: acceptEdits ile birlikte package.json'a betik yazip keyfi komut
  # calistirmaya acik kapi olurdu. Somut betikler sayilir; baska proje baska komut gerekiyorsa
  # -IzinliAraclar ile verilir.
  $desen = 'npm run typecheck', 'npm run build', 'npm run test*', 'npm run design:lint', 'npx tsc *', 'node --check *', 'git status*', 'git diff*', 'git log*', 'git rm *', 'git mv *'
  $IzinliAraclar = foreach ($d in $desen) { "Bash($d)"; "PowerShell($d)" }
}
$yasakli = foreach ($d in 'git commit*', 'git push*') { "Bash($d)"; "PowerShell($d)" }

$arg = @(
  '-p', '--model', $model,
  '--permission-mode', 'acceptEdits',
  '--output-format', 'json',
  '--allowedTools'
) + $IzinliAraclar + @('--disallowedTools') + $yasakli
if ($Efor) { $arg += @('--effort', $Efor) }

# --- Ortam: Kokpit saglayici.cjs ortam() + pty-server.cjs temizOrtam() ---------------------
$sil = @(
  # saglayici.cjs YONETILEN (API_KEY dahil: Bearer anahtari tek kaynak olsun)
  'ANTHROPIC_API_KEY', 'ANTHROPIC_SMALL_FAST_MODEL', 'CLAUDE_CODE_EFFORT_LEVEL',
  # pty-server.cjs TEMIZLENECEK: ebeveyn oturum isaretleri
  'CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_BRIDGE_SESSION_ID', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_PID', 'CLAUDE_EFFORT'
)
$ekle = [ordered]@{
  ANTHROPIC_BASE_URL             = $baseUrl
  ANTHROPIC_AUTH_TOKEN           = $anahtar
  ANTHROPIC_MODEL                = $model
  ANTHROPIC_DEFAULT_OPUS_MODEL   = $model
  ANTHROPIC_DEFAULT_SONNET_MODEL = $model
  ANTHROPIC_DEFAULT_FABLE_MODEL  = $model
  ANTHROPIC_DEFAULT_HAIKU_MODEL  = $hafif
  CLAUDE_CODE_SUBAGENT_MODEL     = $alt
}
$baglam = 0
if ([int]::TryParse([string]$secilen.baglam, [ref]$baglam) -and $baglam -gt 0) {
  $ekle['CLAUDE_CODE_AUTO_COMPACT_WINDOW'] = [string]$baglam
}

$yedek = @{}
foreach ($ad in @($sil) + @($ekle.Keys)) {
  $yedek[$ad] = [Environment]::GetEnvironmentVariable($ad, 'Process')
}
$eskiCikis = [Console]::OutputEncoding
$kod = 1
try {
  foreach ($ad in $sil) { [Environment]::SetEnvironmentVariable($ad, $null, 'Process') }
  foreach ($ad in $ekle.Keys) { [Environment]::SetEnvironmentVariable($ad, $ekle[$ad], 'Process') }
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

  Push-Location -LiteralPath $dizinYolu
  try {
    Get-Content -LiteralPath $brifYolu -Raw -Encoding utf8 |
      & claude @arg 2> $hataYolu |
      Out-File -LiteralPath $ciktiYolu -Encoding utf8NoBOM
    $kod = $LASTEXITCODE
  } finally {
    Pop-Location
  }
} finally {
  [Console]::OutputEncoding = $eskiCikis
  foreach ($ad in $yedek.Keys) { [Environment]::SetEnvironmentVariable($ad, $yedek[$ad], 'Process') }
}

# Savunma: anahtar claude ciktisina sizmissa dosyalardan sil.
foreach ($dosya in $ciktiYolu, $hataYolu) {
  try {
    if (Test-Path -LiteralPath $dosya) {
      $metin = Get-Content -LiteralPath $dosya -Raw -Encoding utf8
      if ($metin -and $metin.Contains($anahtar)) {
        Set-Content -LiteralPath $dosya -Value $metin.Replace($anahtar, '[gizli]') -Encoding utf8NoBOM -NoNewline
      }
    }
  } catch { }
}

Write-Output "ds-isci: saglayici=$secilenAd model=$model cikis=$kod cikti=$ciktiYolu"
exit $kod
