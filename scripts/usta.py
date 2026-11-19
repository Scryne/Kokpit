"""usta: Opus'un kod islerini OpenCode Go modellerine devrettigi isci.

Isci ayri, basiz bir Claude Code sureci (`claude -p`). Ortami yalniz o cocuk surec icin OpenCode Go'nun
Anthropic bicimli ucuna cevrilir; araclari, izin sistemi ve proje CLAUDE.md'si Claude Code'unkiyle ayni
kalir, yalniz model degisir. Claude Code bu ucun dogrulanmis istemcisi (opencode.ai/v2/docs/console/go).
Ortam esleme fikri kayisu dalindaki ds-isci.ps1'den (Emre Kaan Atas) geldi.

Her is projenin ayri bir git worktree'sinde calisir (~/.kokpit/usta/agac/<id>, dal usta/<id>): ucuz model
ana agaci bozamaz. Kabul komutlarini betik kendisi kosar; iscinin raporu kanit sayilmaz. Degisiklik ana
agaca yalniz `al` ile, commit'siz iner; commit'i orkestrator (Opus) atar.

Anahtar ~/.kokpit/usta.json'da DPAPI ile sifreli (Kokpit > Ayarlar > Usta yazar). Yalniz cocuk surecin
ortamina konur; argumana, ekrana, dosyaya girmez. Cikti dosyalarina sizarsa silinir.

Komutlar:
  ver    --proje DIZIN --brif DOSYA [--baslik M] [--model M] [--kabul KOMUT]... [--izin DESEN]... [--kirli] [--sure SN]
  devam  ID --not DOSYA [--sure SN]        ayni oturuma duzeltme notu (ayni worktree, ayni baglam)
  diff   ID [--stat]                       taban..worktree farki (commit'lenmemis dahil)
  al     ID [--duzeltildi] [--not M]       farki ana agaca uygular (commit'siz), worktree'yi kaldirir
  birak  ID [--neden M]                    reddeder, worktree'yi kaldirir
  karar  ID kabul|duzeltip-kabul|ret       sonradan karar duzeltme (olcum icin)
  liste  [--adet N]
  ayar                                     model, uc, anahtar var mi (anahtarin kendisi yazilmaz)

Cikis kodlari: 0 tamam | 1 isci/kabul basarisiz | 2 ayar/anahtar | 3 git | 4 arguman | 5 claude bulunamadi
"""

from __future__ import annotations

import argparse
import base64
import ctypes
import datetime as dt
import json
import os
import secrets
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import NoReturn

for _akis in (sys.stdout, sys.stderr):
    if hasattr(_akis, "reconfigure"):
        getattr(_akis, "reconfigure")(encoding="utf-8", errors="replace")

KOKPIT = Path(os.environ["KOKPIT_DIZIN"]).resolve() if os.environ.get("KOKPIT_DIZIN") else Path.home() / ".kokpit"
AYAR = KOKPIT / "usta.json"
IS_KOK = KOKPIT / "usta" / "is"
AGAC_KOK = KOKPIT / "usta" / "agac"
VARSAYILAN_URL = "https://opencode.ai/inference/go/anthropic"
ENTROPI = b"kokpit-usta"

# Ebeveyn oturumun izleri ve yonetilen degiskenler: cocuk surece miras kalmaz. ANTHROPIC_API_KEY ozellikle:
# gercek Anthropic anahtari ucuncu taraf uca gitmesin.
SILINECEK = [
    "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_DEFAULT_FABLE_MODEL", "ANTHROPIC_SMALL_FAST_MODEL", "ANTHROPIC_CUSTOM_HEADERS",
    "CLAUDE_CODE_SUBAGENT_MODEL", "CLAUDE_CODE_EFFORT_LEVEL", "CLAUDE_CODE_AUTO_COMPACT_WINDOW",
    "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDECODE", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_BRIDGE_SESSION_ID",
    "CLAUDE_CODE_MESSAGING_SOCKET", "CLAUDE_CODE_MESSAGING_TOKEN", "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_PID", "CLAUDE_EFFORT", "KOKPIT_ARIA",
]

# Isci acceptEdits ile dosya duzenler; Bash/PowerShell'de yalniz bu listedekiler (+ kabul komutlari
# + --izin) calisir, gerisi -p kipinde sorulamadigi icin reddedilir. Asil kapi bu liste.
TEMEL_ARACLAR = ["Read", "Edit", "Write", "Glob", "Grep", "TodoWrite", "NotebookEdit"]
TEMEL_KOMUTLAR = ["git status*", "git diff*", "git log*", "git show*", "ls*", "dir*"]
YASAK_KOMUTLAR = ["git commit*", "git push*", "git reset*", "git checkout*", "git switch*", "git rebase*",
                  "git merge*", "git worktree*", "git branch*", "git stash*", "git clean*"]
YASAK_ARACLAR = ["Agent", "Task", "WebFetch", "WebSearch"]

KURALLAR = """Sen bir usta'sin: bir orkestratorun (Claude Opus) verdigi tanimli kod isini yapan isci.
Kurallar:
- Yalniz bu calisma dizininde calis. Brifin dokunma dedigi yere dokunma.
- Commit, push, dal degistirme yok; git'te yalniz status/diff/log.
- Var olmayan API, fonksiyon, paket ya da dosya uydurma: once depoda ara (Grep/Glob/Read), bulamazsan raporda soyle.
- Projenin mevcut kaliplarini, adlandirmasini ve stilini izle. Istenmeyen refactor, yeni bagimlilik, yorum temizligi yapma.
- Kabul komutlari verildiyse bitirmeden once kos ve gecir. Gecmiyorsa nedenini raporla, testi gevsetme ya da silme.
- Bitince 5-12 satir Turkce rapor: degisen dosyalar, kostugun komutlar ve sonuclari, yaptigin varsayimlar, takildigin yer.
"""


def hata(kod: int, mesaj: str) -> NoReturn:
    print(f"usta: {mesaj}", file=sys.stderr)
    sys.exit(kod)


def simdi() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


# --- DPAPI (electron/dpapi.cjs ile ayni kapsam ve entropi) -------------------------------------
class _Blob(ctypes.Structure):
    _fields_ = [("cbData", ctypes.c_uint32), ("pbData", ctypes.POINTER(ctypes.c_char))]


def dpapi_coz(b64: str) -> str:
    if os.name != "nt":
        hata(2, "DPAPI yalniz Windows'ta.")
    veri = base64.b64decode(b64)
    vbuf = ctypes.create_string_buffer(veri, len(veri))
    ebuf = ctypes.create_string_buffer(ENTROPI, len(ENTROPI))
    giris = _Blob(len(veri), ctypes.cast(vbuf, ctypes.POINTER(ctypes.c_char)))
    ent = _Blob(len(ENTROPI), ctypes.cast(ebuf, ctypes.POINTER(ctypes.c_char)))
    cikis = _Blob()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(giris), None, ctypes.byref(ent), None, None, 1, ctypes.byref(cikis)):
        hata(2, "anahtar cozulemedi (baska Windows kullanicisi ya da bozuk kayit). Kokpit > Ayarlar > Usta'dan yeniden gir.")
    try:
        return ctypes.string_at(cikis.pbData, cikis.cbData).decode("utf-8")
    finally:
        ctypes.windll.kernel32.LocalFree(cikis.pbData)


def ayar_oku() -> dict:
    try:
        a = json.loads(AYAR.read_text(encoding="utf-8"))
    except FileNotFoundError:
        hata(2, f"ayar yok: {AYAR}. Kokpit > Ayarlar > Usta'dan OpenCode Go anahtarini kaydet.")
    except Exception:
        hata(2, f"ayar dosyasi okunamadi: {AYAR}")
    return a if isinstance(a, dict) else {}


def anahtar_al(a: dict) -> str:
    k = a.get("anahtar")
    if not isinstance(k, dict) or not k.get("dpapi"):
        hata(2, "anahtar kayitli degil. Kokpit > Ayarlar > Usta'dan kaydet.")
    return dpapi_coz(k["dpapi"])


def on_kontrol(a: dict) -> None:
    """Isciyi baslatmadan anahtari sinar: Claude Code 401'i de 10 kez ussel bekleyerek yeniden deniyor
    (2026-11-19 olculdu), gecersiz anahtar dakikalarca asili kalirdi. /v1/models token harcamaz:
    anahtarsiz 200, gecersiz anahtarla 401. Ag yoksa engellemez, isci kendi hatasini verir."""
    anahtar = anahtar_al(a)
    if os.environ.get("USTA_CLAUDE"):
        return  # test: sahte isci, gercek uca gidilmez
    import socket
    import urllib.error
    import urllib.request

    url = (a.get("baseUrl") or VARSAYILAN_URL).rstrip("/") + "/v1/models"
    istek = urllib.request.Request(url, headers={"Authorization": "Bearer " + anahtar,
                                                 "User-Agent": "kokpit-usta/1.0", "anthropic-version": "2023-06-01"})
    asil = socket.getaddrinfo

    def yalniz_ipv4(host, port, _family=0, *args, **kw):  # AAAA'siz alan adinda cift yigin DNS ~12 sn takiliyor
        return asil(host, port, socket.AF_INET, *args, **kw)

    socket.getaddrinfo = yalniz_ipv4
    try:
        urllib.request.urlopen(istek, timeout=15).close()
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            hata(2, "OpenCode anahtari reddetti (401). Kokpit > Ayarlar > Usta'dan yeni anahtar gir.")
    except (urllib.error.URLError, OSError):
        print("UYARI: anahtar on kontrolu yapilamadi (ag?); isci yine de baslatiliyor.", file=sys.stderr)
    finally:
        socket.getaddrinfo = asil


# --- yardimcilar ---------------------------------------------------------------------------------
def kos(args: list[str], cwd: Path | str | None = None, girdi: bytes | None = None, env: dict | None = None,
        zaman: float | None = None) -> tuple[int, str]:
    """Bayt alir, utf-8 (olmazsa yerel kod sayfasi) cozer: Windows alt surecleri cp1254 yazabiliyor."""
    try:
        p = subprocess.run(args, cwd=cwd, input=girdi, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           env=env, timeout=zaman)
    except FileNotFoundError:
        return 127, f"{args[0]} bulunamadi"
    except subprocess.TimeoutExpired:
        return 124, "zaman asimi"
    return p.returncode, coz(p.stdout)


def kabuk(komut: str, cwd: str, env: dict, zaman: float) -> tuple[int, str]:
    """Kabul komutu: cmd.exe /c (npm, uv, pytest .cmd sarmalayicilari dahil). Zaman asiminda agaciyla oldurulur."""
    p = subprocess.Popen(komut, shell=True, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        cikti, _ = p.communicate(timeout=zaman)
        return p.returncode, coz(cikti)
    except subprocess.TimeoutExpired:
        kos(["taskkill", "/T", "/F", "/PID", str(p.pid)])
        cikti, _ = p.communicate()
        return 124, coz(cikti) + "\n[zaman asimi]"


def coz(b: bytes) -> str:
    try:
        return b.decode("utf-8")
    except UnicodeDecodeError:
        return b.decode("cp1254", errors="replace")


def git(args: list[str], cwd: Path | str) -> str:
    kod, cikti = kos(["git", *args], cwd=cwd)
    if kod != 0:
        hata(3, f"git {' '.join(args[:3])} basarisiz: {cikti.strip()[:400]}")
    return cikti


def durum_yolu(is_id: str) -> Path:
    return IS_KOK / is_id / "durum.json"


def durum_oku(is_id: str) -> dict:
    if not is_id or any(c in is_id for c in "/\\:") or ".." in is_id:
        hata(4, "gecersiz is kimligi")
    try:
        return json.loads(durum_yolu(is_id).read_text(encoding="utf-8"))
    except FileNotFoundError:
        hata(4, f"is bulunamadi: {is_id} (usta.py liste)")


def durum_yaz(d: dict) -> None:
    yol = durum_yolu(d["id"])
    yol.parent.mkdir(parents=True, exist_ok=True)
    gecici = yol.with_suffix(f".{os.getpid()}.tmp")
    gecici.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(gecici, yol)


def claude_komutu() -> list[str]:
    sahte = os.environ.get("USTA_CLAUDE")  # yalniz test: sahte isci
    if sahte:
        return ["node", sahte] if sahte.endswith((".cjs", ".js")) else [sahte]
    yol = shutil.which("claude")
    if not yol:
        hata(5, "'claude' PATH'te yok.")
    return [yol]


def kavsak_kur(ana: Path, agac: Path) -> list[str]:
    """Ana agactaki node_modules/.venv'i worktree'ye junction olarak baglar (kurulum beklemeden test kosulsun).
    Yalniz kok ve bir alt seviye. Donus: worktree'ye gore goreli yollar (temizlikte once bunlar kaldirilir)."""
    adaylar: list[Path] = []
    for ad in ("node_modules", ".venv"):
        adaylar.append(Path(ad))
    try:
        for alt in ana.iterdir():
            if alt.is_dir() and not alt.name.startswith(".") and alt.name not in ("node_modules",):
                for ad in ("node_modules", ".venv"):
                    adaylar.append(Path(alt.name) / ad)
    except OSError:
        pass
    kurulan = []
    for gor in adaylar:
        kaynak, hedef = ana / gor, agac / gor
        if kaynak.is_dir() and not hedef.exists() and hedef.parent.is_dir():
            kod, _ = kos(["cmd", "/c", "mklink", "/J", str(hedef), str(kaynak)])
            if kod == 0:
                kurulan.append(gor.as_posix())
    return kurulan


def kavsak_kaldir(agac: Path, kavsaklar: list[str]) -> None:
    # Junction'i os.rmdir kaldirir, hedefin icerigine dokunmaz. rmtree'den ONCE yapilmali.
    for gor in kavsaklar:
        try:
            os.rmdir(agac / gor)
        except OSError:
            pass


def haric(agac: Path, kavsaklar: list[str]) -> list[str]:
    """Junction'lar farka girmesin. Zaten yok sayilan yol pathspec'te adiyla verilirse `git add` hata verir;
    yalniz .gitignore'un kapsamadigi junction'lar haric tutulur."""
    disari = []
    for k in kavsaklar:
        kod, _ = kos(["git", "check-ignore", "-q", k], cwd=agac)
        if kod != 0:
            disari.append(f":(exclude){k}")
    return disari


def fark(d: dict, stat: bool = False) -> str:
    agac = Path(d["agac"])
    git(["add", "-A", "--", ".", *haric(agac, d.get("kavsaklar", []))], agac)
    return git(["diff", "--cached", "--stat=160" if stat else "--binary", d["taban"]], agac)


def fark_ozeti(d: dict) -> dict:
    agac = Path(d["agac"])
    git(["add", "-A", "--", ".", *haric(agac, d.get("kavsaklar", []))], agac)
    satirlar = git(["diff", "--cached", "--numstat", d["taban"]], agac).strip().splitlines()
    ekleme = silme = 0
    dosyalar = []
    for s in satirlar:
        p = s.split("\t")
        if len(p) == 3:
            ekleme += int(p[0]) if p[0].isdigit() else 0
            silme += int(p[1]) if p[1].isdigit() else 0
            dosyalar.append(p[2])
    return {"dosya": len(dosyalar), "ekleme": ekleme, "silme": silme, "dosyalar": dosyalar[:60]}


def sizinti_temizle(yollar: list[Path], anahtar: str) -> None:
    for y in yollar:
        try:
            if y.exists():
                metin = y.read_bytes().decode("utf-8", errors="replace")
                if anahtar and anahtar in metin:
                    y.write_text(metin.replace(anahtar, "[gizli]"), encoding="utf-8")
        except OSError:
            pass


def agaci_kaldir(d: dict) -> None:
    agac = Path(d["agac"])
    kavsak_kaldir(agac, d.get("kavsaklar", []))
    kos(["git", "worktree", "remove", "--force", str(agac)], cwd=d["proje"])
    if agac.exists():
        shutil.rmtree(agac, ignore_errors=True)
    kos(["git", "worktree", "prune"], cwd=d["proje"])
    kos(["git", "branch", "-D", d["dal"]], cwd=d["proje"])


# --- isciyi calistir -------------------------------------------------------------------------------
def tur_kos(d: dict, mesaj: str, sure: int, devam: bool) -> dict:
    a = ayar_oku()
    anahtar = anahtar_al(a)
    base_url = a.get("baseUrl") or VARSAYILAN_URL
    hafif = a.get("hafifModel") or d["model"]
    tur_no = len(d["turlar"]) + 1
    is_dizin = IS_KOK / d["id"]
    cikti_yolu = is_dizin / f"tur{tur_no}.json"
    hata_yolu = is_dizin / f"tur{tur_no}.err"

    izinli = list(TEMEL_ARACLAR)
    for desen in TEMEL_KOMUTLAR + [k + "*" for k in d["kabul"]] + d["izinler"]:
        izinli += [f"Bash({desen})", f"PowerShell({desen})"]
    yasak = list(YASAK_ARACLAR)
    for desen in YASAK_KOMUTLAR:
        yasak += [f"Bash({desen})", f"PowerShell({desen})"]
    # Yasaklar --settings ile de verilir: bypass kipinde bile tutuyor (olculdu, 2026-10). Hook'lar kapali:
    # projenin SessionEnd kancasi isci oturumunu durum senkronu sanip worktree'de state.json yazmasin,
    # Kokpit'in kanca koprusu isciyi Ada'da oturum diye gostermesin.
    ayarlar = {"disableAllHooks": True, "permissions": {"deny": yasak}}
    kurallar = KURALLAR
    if d["kabul"]:
        kurallar += "Kabul komutlari: " + " | ".join(d["kabul"]) + "\n"

    args = claude_komutu() + [
        "-p", "--model", d["model"], "--permission-mode", "acceptEdits", "--output-format", "json",
        "--settings", json.dumps(ayarlar), "--append-system-prompt", kurallar,
        "--allowedTools", *izinli, "--disallowedTools", *yasak,
    ]
    if devam and d.get("oturum"):
        args += ["--resume", d["oturum"]]

    env = {k: v for k, v in os.environ.items() if k not in SILINECEK}
    env.update({
        "ANTHROPIC_BASE_URL": base_url,
        "ANTHROPIC_AUTH_TOKEN": anahtar,
        "ANTHROPIC_MODEL": d["model"],
        "ANTHROPIC_DEFAULT_OPUS_MODEL": d["model"],
        "ANTHROPIC_DEFAULT_SONNET_MODEL": d["model"],
        "ANTHROPIC_DEFAULT_FABLE_MODEL": d["model"],
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": hafif,
        "CLAUDE_CODE_SUBAGENT_MODEL": d["model"],
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
        "DISABLE_AUTOUPDATER": "1",
        "USTA": "1",
        "PYTHONUTF8": "1",
    })

    d["durum"] = "calisiyor"
    durum_yaz(d)
    bas = time.time()
    with open(cikti_yolu, "wb") as out, open(hata_yolu, "wb") as err:
        try:
            p = subprocess.Popen(args, cwd=d["agac"], stdin=subprocess.PIPE, stdout=out, stderr=err, env=env)
        except FileNotFoundError:
            hata(5, "isci baslatilamadi: claude bulunamadi")
        assert p.stdin is not None
        try:
            p.stdin.write(mesaj.encode("utf-8"))
            p.stdin.close()
        except OSError:
            pass
        try:
            kod = p.wait(timeout=sure)
        except subprocess.TimeoutExpired:
            # Agacla birlikte: claude'un actigi node/test surecleri yetim kalmasin.
            kos(["taskkill", "/T", "/F", "/PID", str(p.pid)])
            p.wait()
            kod = 124
    sure_sn = round(time.time() - bas)
    sizinti_temizle([cikti_yolu, hata_yolu], anahtar)
    del anahtar

    sonuc: dict = {}
    try:
        sonuc = json.loads(cikti_yolu.read_text(encoding="utf-8", errors="replace") or "{}")
    except (OSError, ValueError):
        sonuc = {}
    usage = sonuc.get("usage") or {}
    if sonuc.get("session_id"):
        d["oturum"] = sonuc["session_id"]
    tur = {
        "tur": tur_no,
        "zaman": simdi(),
        "sureSn": sure_sn,
        "cikis": kod,
        "hataMi": bool(sonuc.get("is_error")) or kod != 0,
        "adim": sonuc.get("num_turns"),
        "girdiToken": (usage.get("input_tokens") or 0) + (usage.get("cache_read_input_tokens") or 0)
        + (usage.get("cache_creation_input_tokens") or 0),
        "ciktiToken": usage.get("output_tokens") or 0,
        "rapor": str(sonuc.get("result") or "")[:4000],
        "kabul": [],
    }

    # Kabul: betik kendisi kosar. Isci ortami (OpenCode anahtari) buraya gecmez.
    kabul_env = {k: v for k, v in os.environ.items() if k not in SILINECEK}
    for i, komut in enumerate(d["kabul"], 1):
        kbas = time.time()
        kkod, kcikti = kabuk(komut, d["agac"], kabul_env, d.get("kabulSure", 900))
        (is_dizin / f"tur{tur_no}-kabul{i}.log").write_text(kcikti, encoding="utf-8")
        tur["kabul"].append({"komut": komut, "gecti": kkod == 0, "cikis": kkod, "sureSn": round(time.time() - kbas),
                             "son": "\n".join(kcikti.strip().splitlines()[-25:])})

    d["turlar"].append(tur)
    d["degisiklik"] = fark_ozeti(d)
    d["durum"] = "bekliyor"
    durum_yaz(d)
    return tur


def ozet_yaz(d: dict, tur: dict) -> None:
    print(f"usta: is={d['id']} model={d['model']} tur={tur['tur']} sure={tur['sureSn']}sn cikis={tur['cikis']}"
          f" adim={tur.get('adim')} token(girdi/cikti)={tur['girdiToken']}/{tur['ciktiToken']}")
    if tur["cikis"] == 124:
        print("UYARI: isci zaman asimina ugradi, agaciyla durduruldu.")
    for k in tur["kabul"]:
        print(f"kabul [{'GECTI' if k['gecti'] else 'KALDI'}] {k['komut']} ({k['sureSn']}sn)")
        if not k["gecti"]:
            print("  " + k["son"].replace("\n", "\n  "))
    g = d["degisiklik"]
    print(f"degisiklik: {g['dosya']} dosya, +{g['ekleme']} -{g['silme']}")
    for f in g["dosyalar"][:30]:
        print(f"  {f}")
    rapor = tur["rapor"].strip()
    print("isci raporu (kanit degil):")
    print("  " + (rapor[:2500] or "(bos)").replace("\n", "\n  "))
    hata_dosya = IS_KOK / d["id"] / f"tur{tur['tur']}.err"
    if tur["hataMi"] and hata_dosya.exists():
        son = hata_dosya.read_text(encoding="utf-8", errors="replace").strip()[-800:]
        if son:
            print("isci stderr (son):\n  " + son.replace("\n", "\n  "))
    print(f"agac: {d['agac']}")
    print(f"sonraki: usta.py diff {d['id']} | devam {d['id']} --not DOSYA | al {d['id']} | birak {d['id']}")


def basarili(tur: dict) -> bool:
    return not tur["hataMi"] and all(k["gecti"] for k in tur["kabul"])


# --- komutlar ----------------------------------------------------------------------------------------
def k_ver(ns) -> int:
    brif = Path(ns.brif)
    if not brif.is_file():
        hata(4, f"brif yok: {brif}")
    metin = brif.read_text(encoding="utf-8").strip()
    if not metin:
        hata(4, "brif bos")
    kod, kok = kos(["git", "-C", str(Path(ns.proje).resolve()), "rev-parse", "--show-toplevel"])
    if kod != 0:
        hata(3, f"git deposu degil: {ns.proje}")
    proje = Path(kok.strip()).resolve()

    a = ayar_oku()
    on_kontrol(a)  # anahtar yoksa ya da reddediliyorsa worktree acmadan dur
    model = ns.model or a.get("model")
    if not model:
        hata(2, "model secili degil (Kokpit > Ayarlar > Usta ya da --model)")
    bilinen = {m.get("id") for m in a.get("modeller") or [] if isinstance(m, dict)}
    if bilinen and model not in bilinen:
        hata(4, f"bilinmeyen model: {model}. Listeyi gor: usta.py ayar")

    is_id = dt.datetime.now().strftime("%m%d-%H%M%S-") + secrets.token_hex(2)
    agac = AGAC_KOK / is_id
    dal = f"usta/{is_id}"
    AGAC_KOK.mkdir(parents=True, exist_ok=True)
    taban = git(["rev-parse", "HEAD"], proje).strip()
    kirli = bool(git(["status", "--porcelain"], proje).strip())
    git(["worktree", "add", "-b", dal, str(agac), taban], proje)

    d = {
        "id": is_id, "baslik": (ns.baslik or metin.splitlines()[0].lstrip("# ").strip())[:160],
        "proje": str(proje), "projeAd": proje.name, "model": model, "baslangic": simdi(),
        "durum": "hazirlaniyor", "taban": taban, "dal": dal, "agac": str(agac), "kirliTasindi": False,
        "kavsaklar": [], "kabul": ns.kabul or [], "izinler": ns.izin or [], "kabulSure": 900,
        "oturum": None, "turlar": [], "degisiklik": None, "karar": None, "kararZamani": None, "kararNotu": None,
    }
    try:
        if kirli and ns.kirli:
            # Orkestratorun commit'lenmemis isi isciye tasinir, taban onun ustune commit'lenir (worktree dalinda).
            yama = subprocess.run(["git", "diff", "HEAD", "--binary"], cwd=proje, stdout=subprocess.PIPE).stdout
            if yama.strip():
                p = subprocess.run(["git", "apply", "--whitespace=nowarn", "-"], cwd=agac, input=yama,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
                if p.returncode != 0:
                    raise RuntimeError("kirli degisiklik worktree'ye uygulanamadi: " + coz(p.stdout)[:300])
            for f in git(["ls-files", "--others", "--exclude-standard", "-z"], proje).split("\0"):
                if f:
                    (agac / f).parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(proje / f, agac / f)
            git(["add", "-A"], agac)
            git(["-c", "user.name=usta", "-c", "user.email=usta@localhost", "commit", "--no-verify", "-q",
                 "-m", "usta taban (orkestratorun commit'lenmemis isi)"], agac)
            d["taban"] = git(["rev-parse", "HEAD"], agac).strip()
            d["kirliTasindi"] = True
        d["kavsaklar"] = kavsak_kur(proje, agac)
        durum_yaz(d)
        (IS_KOK / is_id / "brif.md").write_text(metin + "\n", encoding="utf-8")
    except Exception as e:  # noqa: BLE001
        d["durum"] = "hata"
        durum_yaz(d)
        agaci_kaldir(d)
        hata(3, str(e))

    if kirli and not ns.kirli:
        print("UYARI: ana agacta commit'lenmemis degisiklik var; isci HEAD'den basladi ve onlari gormuyor (--kirli ile tasinir).")
    tur = tur_kos(d, metin, ns.sure, devam=False)
    ozet_yaz(d, tur)
    return 0 if basarili(tur) else 1


def k_devam(ns) -> int:
    d = durum_oku(ns.id)
    if d.get("karar"):
        hata(4, f"is kapanmis ({d['karar']})")
    if not Path(d["agac"]).is_dir():
        hata(3, "worktree yok")
    notu = Path(ns.not_)
    if not notu.is_file():
        hata(4, f"not dosyasi yok: {notu}")
    mesaj = notu.read_text(encoding="utf-8").strip()
    on_kontrol(ayar_oku())
    (IS_KOK / d["id"] / f"not{len(d['turlar']) + 1}.md").write_text(mesaj + "\n", encoding="utf-8")
    tur = tur_kos(d, mesaj, ns.sure, devam=True)
    ozet_yaz(d, tur)
    return 0 if basarili(tur) else 1


def k_diff(ns) -> int:
    d = durum_oku(ns.id)
    if not Path(d["agac"]).is_dir():
        hata(3, "worktree yok (is kapanmis olabilir)")
    print(fark(d, stat=ns.stat), end="")
    return 0


def karar_yaz(d: dict, karar: str, notu: str | None) -> None:
    d["karar"] = karar
    d["kararZamani"] = simdi()
    d["kararNotu"] = (notu or None) and notu[:500]
    d["durum"] = "bitti"
    durum_yaz(d)


def k_al(ns) -> int:
    d = durum_oku(ns.id)
    if d.get("karar"):
        hata(4, f"is zaten kapanmis ({d['karar']})")
    if not Path(d["agac"]).is_dir():
        hata(3, "worktree yok")
    d["degisiklik"] = fark_ozeti(d)
    yama = fark(d).encode("utf-8")
    yama_yolu = IS_KOK / d["id"] / "degisiklik.patch"
    yama_yolu.write_bytes(yama)
    if yama.strip():
        p = subprocess.run(["git", "apply", "--whitespace=nowarn", str(yama_yolu)], cwd=d["proje"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        if p.returncode != 0:
            p = subprocess.run(["git", "apply", "--3way", "--whitespace=nowarn", str(yama_yolu)], cwd=d["proje"],
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            if p.returncode != 0:
                hata(3, "yama ana agaca uygulanamadi, worktree yerinde birakildi: "
                        + coz(p.stdout).strip()[:600] + f"\nyama: {yama_yolu}")
            print("not: yama 3-yollu birlestirmeyle uygulandi; cakisma isareti var mi bak (git diff).")
    karar_yaz(d, "duzeltip-kabul" if ns.duzeltildi else "kabul", ns.not_)
    agaci_kaldir(d)
    g = d["degisiklik"]
    print(f"usta: {d['id']} ana agaca uygulandi (commit'siz): {g['dosya']} dosya, +{g['ekleme']} -{g['silme']}")
    for f in g["dosyalar"]:
        print(f"  {f}")
    print("Kabul komutlarini ana agacta yeniden kos, sonra commit'le.")
    return 0


def k_birak(ns) -> int:
    d = durum_oku(ns.id)
    if d.get("karar"):
        hata(4, f"is zaten kapanmis ({d['karar']})")
    if Path(d["agac"]).is_dir():
        d["degisiklik"] = fark_ozeti(d)
        (IS_KOK / d["id"] / "degisiklik.patch").write_bytes(fark(d).encode("utf-8"))
    karar_yaz(d, "ret", ns.neden)
    agaci_kaldir(d)
    print(f"usta: {d['id']} birakildi; yamasi kayitta: {IS_KOK / d['id'] / 'degisiklik.patch'}")
    return 0


def k_karar(ns) -> int:
    d = durum_oku(ns.id)
    karar_yaz(d, ns.karar, ns.not_)
    print(f"usta: {d['id']} karar={ns.karar}")
    return 0


def k_liste(ns) -> int:
    isler = []
    if IS_KOK.is_dir():
        for y in IS_KOK.iterdir():
            try:
                isler.append(json.loads((y / "durum.json").read_text(encoding="utf-8")))
            except (OSError, ValueError):
                pass
    isler.sort(key=lambda d: d.get("baslangic", ""), reverse=True)
    for d in isler[: ns.adet]:
        son = (d.get("turlar") or [{}])[-1]
        kabul = son.get("kabul") or []
        k = "-" if not kabul else ("gecti" if all(x.get("gecti") for x in kabul) else "kaldi")
        print(f"{d['id']}  {d.get('projeAd', '')[:16]:16} {d.get('model', '')[:20]:20} tur={len(d.get('turlar') or [])}"
              f" kabul={k:5} karar={d.get('karar') or d.get('durum')}  {d.get('baslik', '')[:60]}")
    if not isler:
        print("henuz is yok")
    return 0


def k_ayar(_ns) -> int:
    a = ayar_oku()
    k = a.get("anahtar")
    print(f"uc={a.get('baseUrl') or VARSAYILAN_URL}")
    print(f"model={a.get('model')}  hafif={a.get('hafifModel')}")
    print(f"anahtar={'var (…' + k.get('ipucu', '') + ')' if isinstance(k, dict) and k.get('dpapi') else 'YOK'}")
    d = a.get("dogrulama") or {}
    print(f"dogrulama={d.get('durum', '-')} {d.get('zaman', '')}")
    modeller = [str(m["id"]) for m in a.get("modeller") or [] if isinstance(m, dict) and m.get("id")]
    print(f"modeller ({len(modeller)}): {', '.join(modeller) if modeller else '(liste yok; Kokpit > Ayarlar > Usta > Yenile)'}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(prog="usta.py", description="OpenCode Go iscisi (bkz. dosya basi)")
    alt = ap.add_subparsers(dest="komut", required=True)
    v = alt.add_parser("ver")
    v.add_argument("--proje", required=True)
    v.add_argument("--brif", required=True)
    v.add_argument("--baslik")
    v.add_argument("--model")
    v.add_argument("--kabul", action="append", help="tekrarlanabilir; worktree'de cmd ile kosulur")
    v.add_argument("--izin", action="append", help="isciye ek Bash/PowerShell deseni, or. 'uv run pytest*'")
    v.add_argument("--kirli", action="store_true", help="ana agacin commit'lenmemis isini isciye tasi")
    v.add_argument("--sure", type=int, default=1800)
    dv = alt.add_parser("devam")
    dv.add_argument("id")
    dv.add_argument("--not", dest="not_", required=True)
    dv.add_argument("--sure", type=int, default=1800)
    df = alt.add_parser("diff")
    df.add_argument("id")
    df.add_argument("--stat", action="store_true")
    al = alt.add_parser("al")
    al.add_argument("id")
    al.add_argument("--duzeltildi", action="store_true", help="Opus'un elle duzeltecegi/duzelttigi kabul")
    al.add_argument("--not", dest="not_")
    b = alt.add_parser("birak")
    b.add_argument("id")
    b.add_argument("--neden")
    kr = alt.add_parser("karar")
    kr.add_argument("id")
    kr.add_argument("karar", choices=["kabul", "duzeltip-kabul", "ret"])
    kr.add_argument("--not", dest="not_")
    ls = alt.add_parser("liste")
    ls.add_argument("--adet", type=int, default=15)
    alt.add_parser("ayar")
    ns = ap.parse_args()
    return {"ver": k_ver, "devam": k_devam, "diff": k_diff, "al": k_al, "birak": k_birak, "karar": k_karar,
            "liste": k_liste, "ayar": k_ayar}[ns.komut](ns)


if __name__ == "__main__":
    sys.exit(main())
