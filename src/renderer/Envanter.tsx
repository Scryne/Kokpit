import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Durum } from './types';

interface Props {
  durum: Durum;
}

function tk(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'k';
  return String(n);
}

/** Ad listesi: mono, virgulle degil cip olarak; bos liste acikca soylenir. */
function Cipler({ adlar, bos = 'yok' }: { adlar: string[]; bos?: string }) {
  if (adlar.length === 0) return <span className="text-xs text-metin-soluk">{bos}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {adlar.map((a) => (
        <li key={a} className="enstruman rounded-rozet border border-kenar px-2 py-0.5 text-xs text-metin-ikincil">
          {a}
        </li>
      ))}
    </ul>
  );
}

function Blok({ baslik, sayi, children }: { baslik: string; sayi?: number; children: React.ReactNode }) {
  return (
    <section className="halka relative rounded-base bg-yuzey">
      <h2 className="etiket flex items-center gap-2 border-b border-kenar px-5 py-3">
        {baslik}
        {sayi !== undefined && <span className="enstruman text-metin-soluk">{sayi}</span>}
      </h2>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export default function Envanter({ durum }: Props) {
  const e = durum.envanter;
  const b = durum.butce;
  const tip = b.tip ?? {};
  const oturum = tip.oturum?.yeni_girdi ?? 0;
  const hook = tip.hook?.yeni_girdi ?? 0;
  const hookPayi = oturum + hook > 0 ? Math.round((hook / (oturum + hook)) * 100) : 0;
  const projeSkilli = durum.projeler.filter((p) => p.skills.length > 0);
  const mcpProje = Object.entries(e.mcp_proje ?? {});
  const driftVar = e.drift_kayitsiz.length > 0 || e.drift_hayalet.length > 0;

  return (
    <div className="space-y-6">
      {/* Drift en ustte: bu sayfanin tek "mudahale gerektiren" bilgisi. */}
      <section
        className={
          'halka relative rounded-base px-5 py-4 ' +
          (driftVar ? 'border border-dikkat/30 bg-dikkat/10' : 'bg-yuzey')
        }
      >
        <h2 className="etiket flex items-center gap-2">
          {driftVar ? (
            <AlertTriangle className="size-3.5 text-dikkat-metin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-3.5 text-metin-soluk" aria-hidden="true" />
          )}
          CLAUDE.md drift
        </h2>
        {driftVar ? (
          <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-metin-soluk">Diskte var, kayıtta yok</dt>
              <dd className="mt-1">
                <Cipler adlar={e.drift_kayitsiz} bos="—" />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-metin-soluk">Kayıtta var, diskte yok (hayalet)</dt>
              <dd className="mt-1">
                <Cipler adlar={e.drift_hayalet} bos="—" />
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-metin-ikincil">
            Kurulu skill'ler ile <span className="enstruman">~/.claude/CLAUDE.md</span> kaydı örtüşüyor.
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Blok baslik="Global skill'ler" sayi={e.global_skills.length}>
          <Cipler adlar={e.global_skills} />
        </Blok>
        <Blok baslik="Vault skill'leri" sayi={e.vault_skills.length}>
          <Cipler adlar={e.vault_skills} />
        </Blok>
        <Blok baslik="MCP sunucuları" sayi={e.mcp_global.length + mcpProje.reduce((t, [, l]) => t + l.length, 0)}>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs text-metin-soluk">Global</dt>
              <dd className="mt-1">
                <Cipler adlar={e.mcp_global} />
              </dd>
            </div>
            {mcpProje.map(([proje, liste]) => (
              <div key={proje}>
                <dt className="enstruman text-xs text-metin-soluk">{proje}</dt>
                <dd className="mt-1">
                  <Cipler adlar={liste} />
                </dd>
              </div>
            ))}
          </dl>
        </Blok>
        <Blok baslik="Proje skill'leri" sayi={projeSkilli.reduce((t, p) => t + p.skills.length, 0)}>
          {projeSkilli.length === 0 ? (
            <span className="text-xs text-metin-soluk">hiçbir projede yerel skill yok</span>
          ) : (
            <dl className="space-y-3">
              {projeSkilli.map((p) => (
                <div key={p.ad}>
                  <dt className="enstruman text-xs text-metin-soluk">{p.ad}</dt>
                  <dd className="mt-1">
                    <Cipler adlar={p.skills} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Blok>
      </div>

      {/* Transcript hijyeni: butce tipi + oksuz dizinler. */}
      <Blok baslik={'Transcript hijyeni · ' + (b.pencere_gun ?? 7) + ' gün'}>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-metin-soluk">Oturum · yeni girdi</dt>
            <dd className="enstruman mt-1 text-lg leading-none text-metin">{tk(oturum)}</dd>
          </div>
          <div>
            <dt className="text-xs text-metin-soluk">Hook artığı · yeni girdi</dt>
            <dd className={'enstruman mt-1 text-lg leading-none ' + (hookPayi >= 20 ? 'text-dikkat-metin' : 'text-metin')}>
              {tk(hook)} <span className="text-xs text-metin-soluk">%{hookPayi}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-metin-soluk">Transcript dizinleri</dt>
            <dd className="enstruman mt-1 text-lg leading-none text-metin">
              {b.toplam_dizin ?? 0}{' '}
              <span className="text-xs text-metin-soluk">{b.hook_dizin ?? 0} hook</span>
            </dd>
          </div>
        </dl>
        <div className="mt-4">
          <p className="text-xs text-metin-soluk">Öksüz dizinler (diskte olmayan projeye ait)</p>
          <div className="mt-1">
            <Cipler adlar={b.oksuz ?? []} bos="yok" />
          </div>
        </div>
      </Blok>
    </div>
  );
}
