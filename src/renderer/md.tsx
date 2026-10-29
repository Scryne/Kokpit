import type { ReactNode } from 'react';

// v3.3: hafif markdown cizici (Aria sohbeti, hafiza paneli). HTML enjeksiyonu yok: metin React dugumlerine bolunur.

/** Hafif markdown -> React (HTML enjeksiyonu yok): kod blogu, liste, baslik, **kalin**, `kod`, [baglanti](url). */
export function mdCiz(metin: string, son?: ReactNode): ReactNode[] {
  const cikti: ReactNode[] = [];
  const bloklar = metin.split(/```[\w-]*\n?/);
  bloklar.forEach((blok, bi) => {
    if (bi % 2 === 1) {
      cikti.push(
        <pre key={'k' + bi} className="enstruman my-2 overflow-x-auto rounded-kontrol bg-terminal px-3 py-2 text-xs text-metin-ikincil">
          {blok.replace(/\n$/, '')}
        </pre>
      );
      return;
    }
    const satirlar = blok.split('\n');
    let liste: { sirali: boolean; ogeler: string[] } | null = null;
    const listeyiBosalt = (k: string) => {
      if (!liste) return;
      const L = liste.sirali ? 'ol' : 'ul';
      cikti.push(
        <L key={k} className={(liste.sirali ? 'list-decimal' : 'list-disc') + ' my-1.5 space-y-0.5 pl-5 marker:text-metin-soluk'}>
          {liste.ogeler.map((o, i) => (
            <li key={i}>{satirIci(o)}</li>
          ))}
        </L>
      );
      liste = null;
    };
    satirlar.forEach((s, i) => {
      const anahtar = bi + '-' + i;
      const madde = /^\s*[-*•]\s+(.*)$/.exec(s);
      const sira = /^\s*\d+[.)]\s+(.*)$/.exec(s);
      if (madde || sira) {
        const sirali = !!sira;
        if (liste && liste.sirali !== sirali) listeyiBosalt('l' + anahtar);
        if (!liste) liste = { sirali, ogeler: [] };
        liste.ogeler.push((madde ?? sira)![1]);
        return;
      }
      listeyiBosalt('l' + anahtar);
      const baslik = /^#{1,6}\s+(.*)$/.exec(s);
      const sonSatir = bi === bloklar.length - 1 && satirlar.slice(i + 1).every((x) => !x.trim());
      if (baslik) cikti.push(<p key={anahtar} className="mt-2 font-medium text-metin">{satirIci(baslik[1])}{sonSatir && son}</p>);
      else if (s.trim()) cikti.push(<p key={anahtar} className="my-1">{satirIci(s)}{sonSatir && son}</p>);
    });
    listeyiBosalt('son' + bi);
  });
  return cikti;
}

function satirIci(s: string): ReactNode[] {
  const parcalar: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let son = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > son) parcalar.push(s.slice(son, m.index));
    const p = m[0];
    if (p.startsWith('**')) parcalar.push(<strong key={i++} className="font-semibold text-metin">{p.slice(2, -2)}</strong>);
    else if (p.startsWith('`')) parcalar.push(<code key={i++} className="enstruman rounded bg-yuzey-guclu px-1 py-px text-[0.85em] text-metin-ikincil">{p.slice(1, -1)}</code>);
    else {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p)!;
      parcalar.push(
        <button key={i++} type="button" onClick={() => void window.kokpit.linkAc(mm[2])} className="cursor-pointer text-aksan-metin underline decoration-kenar-guclu underline-offset-2 hover:text-metin">
          {mm[1]}
        </button>
      );
    }
    son = m.index + p.length;
  }
  if (son < s.length) parcalar.push(s.slice(son));
  return parcalar;
}
