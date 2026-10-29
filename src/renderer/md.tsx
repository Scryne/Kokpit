import type { ReactNode } from 'react';

// v3.3: hafif markdown cizici (Aria sohbeti, hafiza paneli). HTML enjeksiyonu yok: metin React dugumlerine bolunur.
// v3.5: tablo (Aria cok uretir), alinti, ic ice liste, numarali listenin baslangici, yatay cizgi; baglanti adresi
// ipucunda gorunur; akis imleci son blok liste/kod/tablo olsa da cizilir.

type Liste = { sirali: boolean; baslangic: number; ogeler: { metin: string; alt: Liste | null }[] };

/** Hafif markdown -> React (HTML enjeksiyonu yok): kod blogu, liste, tablo, alinti, baslik, **kalin**, *egik*, `kod`, [baglanti](url). */
export function mdCiz(metin: string, son?: ReactNode): ReactNode[] {
  const cikti: ReactNode[] = [];
  let imlecKondu = false;
  const bloklar = metin.split(/```[\w-]*\n?/);
  bloklar.forEach((blok, bi) => {
    if (bi % 2 === 1) {
      cikti.push(
        <pre key={'k' + bi} className="enstruman my-2 max-w-full overflow-x-auto rounded-kontrol bg-terminal px-3 py-2 text-xs text-metin-ikincil">
          {blok.replace(/\n$/, '')}
        </pre>
      );
      return;
    }
    const satirlar = blok.split('\n');
    let kok: Liste | null = null;
    // Ic ice liste: girinti yigini (her duzeyin girinti genisligi ve listesi).
    let yigin: { girinti: number; liste: Liste }[] = [];
    const listeyiBosalt = (k: string) => {
      if (!kok) return;
      cikti.push(listeCiz(kok, k));
      kok = null;
      yigin = [];
    };
    let tablo: string[][] | null = null;
    const tabloyuBosalt = (k: string) => {
      if (!tablo) return;
      cikti.push(tabloCiz(tablo, k));
      tablo = null;
    };
    let alinti: string[] | null = null;
    const alintiyiBosalt = (k: string) => {
      if (!alinti) return;
      cikti.push(
        <blockquote key={k} className="my-1.5 border-l-2 border-kenar-guclu pl-3 text-metin-ikincil">
          {alinti.map((a, i) => (
            <p key={i}>{satirIci(a)}</p>
          ))}
        </blockquote>
      );
      alinti = null;
    };

    satirlar.forEach((s, i) => {
      const anahtar = bi + '-' + i;
      // Tablo: | a | b | satirlari; ayirici (|---|:--:|) atlanir.
      if (/^\s*\|.*\|\s*$/.test(s)) {
        listeyiBosalt('l' + anahtar);
        alintiyiBosalt('a' + anahtar);
        if (/^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(s)) return;
        const hucreler = s.trim().slice(1, -1).split('|').map((h) => h.trim());
        (tablo ??= []).push(hucreler);
        return;
      }
      tabloyuBosalt('t' + anahtar);
      const alintiSatiri = /^\s*>\s?(.*)$/.exec(s);
      if (alintiSatiri) {
        listeyiBosalt('l' + anahtar);
        (alinti ??= []).push(alintiSatiri[1]);
        return;
      }
      alintiyiBosalt('a' + anahtar);
      const madde = /^(\s*)[-*•]\s+(.*)$/.exec(s);
      const sira = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(s);
      if (madde || sira) {
        const girinti = (madde ?? sira)![1].replace(/\t/g, '    ').length;
        const sirali = !!sira;
        const govde = madde ? madde[2] : sira![3];
        while (yigin.length && girinti < yigin[yigin.length - 1].girinti) yigin.pop();
        const ust = yigin[yigin.length - 1];
        if (!ust) {
          if (kok && kok.sirali !== sirali) listeyiBosalt('l' + anahtar);
          if (!kok) kok = { sirali, baslangic: sira ? Number(sira[2]) : 1, ogeler: [] };
          yigin = [{ girinti, liste: kok }];
          kok.ogeler.push({ metin: govde, alt: null });
        } else if (girinti > ust.girinti && ust.liste.ogeler.length) {
          // Bir duzey iceri: son ogenin alt listesi.
          const sonOge = ust.liste.ogeler[ust.liste.ogeler.length - 1];
          sonOge.alt ??= { sirali, baslangic: sira ? Number(sira[2]) : 1, ogeler: [] };
          sonOge.alt.ogeler.push({ metin: govde, alt: null });
          yigin.push({ girinti, liste: sonOge.alt });
        } else {
          ust.liste.ogeler.push({ metin: govde, alt: null });
        }
        return;
      }
      // Liste ogesinin devam satiri (girintili duz metin) ogeye eklenir; bos satir listeyi bitirmez.
      if (kok && (!s.trim() || /^\s{2,}\S/.test(s))) {
        if (s.trim()) {
          const ust = yigin[yigin.length - 1].liste;
          const sonOge = ust.ogeler[ust.ogeler.length - 1];
          sonOge.metin += ' ' + s.trim();
        }
        return;
      }
      listeyiBosalt('l' + anahtar);
      const sonSatir = bi === bloklar.length - 1 && satirlar.slice(i + 1).every((x) => !x.trim());
      const imlec = sonSatir && son ? ((imlecKondu = true), son) : null;
      const baslik = /^#{1,6}\s+(.*)$/.exec(s);
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(s)) cikti.push(<hr key={anahtar} className="my-2 border-kenar" />);
      else if (baslik) cikti.push(<p key={anahtar} className="mt-2 font-medium text-metin">{satirIci(baslik[1])}{imlec}</p>);
      else if (s.trim()) cikti.push(<p key={anahtar} className="my-1">{satirIci(s)}{imlec}</p>);
    });
    listeyiBosalt('son' + bi);
    tabloyuBosalt('tson' + bi);
    alintiyiBosalt('ason' + bi);
  });
  // Son blok liste/kod/tablo ise imlec yine gorunur (akis surerken).
  if (son && !imlecKondu) cikti.push(<span key="imlec">{son}</span>);
  return cikti;
}

function listeCiz(l: Liste, k: string): ReactNode {
  const L = l.sirali ? 'ol' : 'ul';
  return (
    <L key={k} start={l.sirali && l.baslangic !== 1 ? l.baslangic : undefined} className={(l.sirali ? 'list-decimal' : 'list-disc') + ' my-1.5 space-y-0.5 pl-5 marker:text-metin-soluk'}>
      {l.ogeler.map((o, i) => (
        <li key={i}>
          {satirIci(o.metin)}
          {o.alt && listeCiz(o.alt, k + '-' + i)}
        </li>
      ))}
    </L>
  );
}

function tabloCiz(satirlar: string[][], k: string): ReactNode {
  const [bas, ...govde] = satirlar;
  return (
    <div key={k} className="my-2 max-w-full overflow-x-auto">
      <table className="text-left text-[0.8125rem]">
        <thead>
          <tr className="border-b border-kenar-guclu">
            {bas.map((h, i) => (
              <th key={i} scope="col" className="px-2 py-1 font-medium text-metin">
                {satirIci(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {govde.map((s, i) => (
            <tr key={i} className="border-b border-kenar last:border-0">
              {s.map((h, j) => (
                <td key={j} className="px-2 py-1 align-top text-metin-ikincil">
                  {satirIci(h)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function satirIci(s: string): ReactNode[] {
  const parcalar: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|(?<![\w*])\*[^*\s][^*]*\*(?![\w*]))/g;
  let son = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > son) parcalar.push(s.slice(son, m.index));
    const p = m[0];
    if (p.startsWith('**')) parcalar.push(<strong key={i++} className="font-semibold text-metin">{p.slice(2, -2)}</strong>);
    else if (p.startsWith('`')) parcalar.push(<code key={i++} className="enstruman rounded bg-yuzey-guclu px-1 py-px text-[0.85em] text-metin-ikincil">{p.slice(1, -1)}</code>);
    else if (p.startsWith('*')) parcalar.push(<em key={i++}>{p.slice(1, -1)}</em>);
    else {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p)!;
      let alan = '';
      try {
        alan = new URL(mm[2]).hostname;
      } catch {
        alan = mm[2];
      }
      // Etiket ile adres ayri: adres ipucunda ve ekran okuyucuda gorunur (\"Belgeler\" yazip baska yere gitmesin).
      parcalar.push(
        <button
          key={i++}
          type="button"
          title={mm[2]}
          aria-label={mm[1] + ' (' + alan + ')'}
          onClick={() => void window.kokpit.linkAc(mm[2])}
          className="cursor-pointer text-aksan-metin underline decoration-kenar-guclu underline-offset-2 hover:text-metin"
        >
          {mm[1]}
        </button>
      );
    }
    son = m.index + p.length;
  }
  if (son < s.length) parcalar.push(s.slice(son));
  return parcalar;
}
