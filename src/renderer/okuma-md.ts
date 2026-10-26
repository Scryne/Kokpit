// Okuma sayfasinin markdown yardimcilari (v2.9): frontmatter, wikilink, baslik kimlikleri.
// Bagimlilik eklemeden kucuk tutuldu; agac yuruyucu her iki agac (mdast/hast) icin ayni.

/** Frontmatter: `---` blogu ayrilir, basit `anahtar: deger` ve `[a, b]` satirlari okunur. */
export interface Onbilgi {
  alanlar: Record<string, string | string[]>;
  govde: string;
}

export function onbilgiAyir(ham: string): Onbilgi {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(ham);
  if (!m) return { alanlar: {}, govde: ham };
  const alanlar: Record<string, string | string[]> = {};
  for (const satir of m[1].split(/\r?\n/)) {
    const a = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(satir);
    if (!a) continue;
    const deger = a[2].trim();
    const dizi = /^\[(.*)\]$/.exec(deger);
    alanlar[a[1]] = dizi
      ? dizi[1].split(',').map((x) => tirnaksiz(x.trim())).filter(Boolean)
      : tirnaksiz(deger);
  }
  return { alanlar, govde: ham.slice(m[0].length) };
}

function tirnaksiz(s: string) {
  return s.replace(/^(["'])(.*)\1$/, '$2');
}

/** Baslik kimligi: kucuk harf (Turkce), harf/rakam disi tire. Ayni baslik tekrar ederse -2, -3. */
export function slug(metin: string) {
  return (
    metin
      .toLocaleLowerCase('tr-TR')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'baslik'
  );
}

interface Dugum {
  type: string;
  value?: string;
  tagName?: string;
  url?: string;
  properties?: Record<string, unknown>;
  children?: Dugum[];
}

function metni(d: Dugum): string {
  if (d.type === 'text' || d.type === 'inlineCode') return d.value ?? '';
  return (d.children ?? []).map(metni).join('');
}

const WIKI = /\[\[([^\]\n]+?)\]\]/g;

/**
 * remark: `[[Hedef]]`, `[[Hedef|Etiket]]`, `[[Hedef#Baslik]]` -> `wiki:` baglantisi. Yalniz metin
 * dugumlerinde calisir; kod (inlineCode/code) ayri dugum oldugu icin `[[...]]` orada kalir.
 */
export function remarkWiki() {
  return (agac: Dugum) => {
    const yuru = (d: Dugum) => {
      if (!d.children) return;
      const yeni: Dugum[] = [];
      for (const c of d.children) {
        if (c.type === 'text' && c.value && c.value.includes('[[')) {
          let son = 0;
          for (const m of c.value.matchAll(WIKI)) {
            const [hedefKismi, etiket] = m[1].split('|');
            const hedef = hedefKismi.trim();
            if (!hedef || /^[-\d.,\s]+$/.test(hedef)) continue; // [[-0.137, -1.419]] gibi sayi dizileri
            if (m.index > son) yeni.push({ type: 'text', value: c.value.slice(son, m.index) });
            yeni.push({
              type: 'link',
              url: 'wiki:' + encodeURIComponent(hedef),
              children: [{ type: 'text', value: (etiket ?? hedef.replace(/#.*/, '')).trim() || hedef }],
            });
            son = m.index + m[0].length;
          }
          if (son < c.value.length) yeni.push({ type: 'text', value: c.value.slice(son) });
        } else {
          if (c.type !== 'link' && c.type !== 'code' && c.type !== 'inlineCode') yuru(c);
          yeni.push(c);
        }
      }
      d.children = yeni;
    };
    yuru(agac);
  };
}

export interface BaslikOgesi {
  id: string;
  metin: string;
  seviye: number;
}

/** rehype: h1-h4'e kimlik verir ve basliklari toplayiciya bildirir (sagdaki baslik listesi). */
export function rehypeBasliklar(secenek: { toplayici: (b: BaslikOgesi[]) => void }) {
  return (agac: Dugum) => {
    const gorulen = new Map<string, number>();
    const liste: BaslikOgesi[] = [];
    const yuru = (d: Dugum) => {
      if (d.type === 'element' && d.tagName && /^h[1-4]$/.test(d.tagName)) {
        const metin = metni(d).trim();
        const temel = slug(metin);
        const n = (gorulen.get(temel) ?? 0) + 1;
        gorulen.set(temel, n);
        const id = n === 1 ? temel : temel + '-' + n;
        d.properties = { ...(d.properties ?? {}), id };
        liste.push({ id, metin, seviye: Number(d.tagName[1]) });
        return;
      }
      d.children?.forEach(yuru);
    };
    yuru(agac);
    secenek.toplayici(liste);
  };
}

/** react-markdown url suzgeci: http(s), mailto, wiki: ve goreli yollar gecer; gerisi bos. */
export function urlSuzgeci(url: string) {
  if (/^(https?:|mailto:|wiki:)/i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return '';
  return url;
}

/** Notun icindeki cozulmesi gereken hedefler: wikilink adlari ve goreli .md baglantilari. */
export function baglantiHedefleri(govde: string): string[] {
  const kodsuz = govde.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const hedefler = new Set<string>();
  for (const m of kodsuz.matchAll(WIKI)) {
    const h = m[1].split('|')[0].trim();
    if (h && !/^[-\d.,\s]+$/.test(h)) hedefler.add(h);
  }
  for (const m of kodsuz.matchAll(/\]\(([^)\s]+?\.md(?:#[^)\s]*)?)\)/gi)) {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(m[1])) hedefler.add(m[1]);
  }
  return [...hedefler];
}

/** "bugün 08:45", "dün 21:32", "14 Eki", "3 Mar 2025". */
export function zamanMetni(ms: number, simdi = Date.now()) {
  const d = new Date(ms);
  const bugun = new Date(simdi);
  bugun.setHours(0, 0, 0, 0);
  const gun = Math.round((bugun.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  const saat = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (gun === 0) return 'bugün ' + saat;
  if (gun === 1) return 'dün ' + saat;
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== bugun.getFullYear() ? { year: 'numeric' } : {}),
  });
}
