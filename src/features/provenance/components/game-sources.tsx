import type { GameProvenance } from "../contracts";
import { MetadataSource } from "./metadata-source";
export function GameSources({ provenance }: { provenance: GameProvenance }) {
  return (
    <section
      id="game-sources"
      aria-labelledby="game-sources-title"
      className="min-w-0 scroll-mt-24 space-y-4"
    >
      <h2 id="game-sources-title" className="font-heading text-2xl">
        Metadata sources
      </h2>
      <p className="text-sm text-muted-foreground">
        These sources describe the latest recorded change to each catalog field.
        A merged group can retain earlier manual values. Missing source records
        are labelled unknown; external references alone do not prove where
        another field came from.
      </p>
      <p className="text-sm text-muted-foreground">
        Descriptions, trailers and playtime use the release value when recorded,
        otherwise the game value. Game evidence does not establish a physical
        edition or market.
      </p>
      {(
        [
          ["Game sources", provenance.game],
          ["Release sources", provenance.release],
        ] as const
      ).map(([label, fields]) => (
        <details key={label} className="min-w-0 rounded-xl bg-card p-5 sm:p-6">
          <summary className="min-h-11 cursor-pointer py-3 font-heading text-xl">
            {label}
          </summary>
          <ul className="divide-y divide-border">
            {fields.map((field) => (
              <li key={field.field} className="min-w-0 space-y-3 py-5">
                <h3 className="font-medium">{field.label}</h3>
                {!field.hasValue && (
                  <p className="text-sm text-muted-foreground">
                    No current value recorded.
                  </p>
                )}
                <MetadataSource attribution={field} />
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
