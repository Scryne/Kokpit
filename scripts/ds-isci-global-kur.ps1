# DeepSeek iscisini her projede kullanilabilir yapar: baslaticiyi ve skill'i ~/.claude altina
# kopyalar, global CLAUDE.md'nin rol dagilimina bir satir ekler. Tekrar calistirmak zararsiz.
# Calistir:  pwsh -File scripts/ds-isci-global-kur.ps1
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$claude = Join-Path $HOME '.claude'

# 1) Baslatici
$betikHedef = Join-Path $claude 'scripts\ds-isci.ps1'
New-Item -ItemType Directory -Force (Split-Path $betikHedef) | Out-Null
Copy-Item (Join-Path $repo 'scripts\ds-isci.ps1') $betikHedef -Force
"baslatici -> $betikHedef"

# 2) Skill (betik yolu global konuma cevrilir)
$skillHedef = Join-Path $claude 'skills\deepseek-isci\SKILL.md'
New-Item -ItemType Directory -Force (Split-Path $skillHedef) | Out-Null
$skill = Get-Content (Join-Path $repo '.claude\skills\deepseek-isci\SKILL.md') -Raw -Encoding utf8
$skill = $skill.Replace('scripts/ds-isci.ps1', '"$HOME\.claude\scripts\ds-isci.ps1"')
Set-Content $skillHedef $skill -Encoding utf8 -NoNewline
"skill     -> $skillHedef"

# 3) CLAUDE.md: rol dagilimina tek satir
$md = Join-Path $claude 'CLAUDE.md'
$satir = 'DeepSeek (OpenCode Go, `deepseek-isci` skill''i): mekanik implementasyonun ilk tercihi. Sonnet: tasarım gerektiren implementasyon ve DeepSeek''in takıldığı iş.'
$icerik = Get-Content $md -Raw -Encoding utf8
if ($icerik.Contains('deepseek-isci')) {
  'CLAUDE.md -> satir zaten var, dokunulmadi'
} else {
  $capa = 'Sonnet implementasyon (kod, taşıma, mekanik iş).'
  if (-not $icerik.Contains($capa)) { throw "CLAUDE.md'de beklenen satir bulunamadi; elle ekle: $satir" }
  Copy-Item $md "$md.yedek" -Force
  Set-Content $md $icerik.Replace($capa, "$capa`n$satir") -Encoding utf8 -NoNewline
  "CLAUDE.md -> satir eklendi (yedek: $md.yedek)"
}
