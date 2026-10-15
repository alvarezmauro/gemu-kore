# Console seed coverage — Task 8.3

Reviewed on **2026-10-15**. The version-1 inputs contain **4 companies, 5 commercial markets, 19 console platforms and 35 physical hardware entries**. They cover every platform family listed in Task 8.3 using the [existing seed contract](README.md). These files are catalog inputs; no database applicator or automatic import is implemented.

## Included hardware

Names below summarize the committed entries. Full stable keys, model numbers, market links, source URLs, check dates and evidence limits live in [platforms.json](consoles/platforms.json) and [models.json](consoles/models.json).

| Platform                  | Representative hardware entries                              |
| ------------------------- | ------------------------------------------------------------ |
| NES / Famicom             | Family Computer HVC-001, Japan                               |
| SNES / Super Famicom      | Original Japanese Super Famicom design                       |
| Nintendo 64               | Japanese launch design                                       |
| Nintendo GameCube         | DOL-001 (USA), DOL-101 (USA)                                 |
| Wii                       | RVL-001 (EUR), RVL-101 (EUR), Wii mini RVL-201               |
| Nintendo Switch           | HAC-001, HAC-001(-01), Lite HDH-001, OLED HEG-001            |
| SEGA Master System        | MK-2000, Japan                                               |
| SEGA Mega Drive / Genesis | HAA-2500 and Mega Drive 2 HAA-2502, Japan                    |
| SEGA Saturn               | HST-3210, Japan                                              |
| Dreamcast                 | HKT-5000, Japan                                              |
| PlayStation               | SCPH-1000 and PS one SCPH-100, Japan                         |
| PlayStation 2             | SCPH-10000 and SCPH-70000 series, Japan                      |
| PlayStation 3             | CECH-A00 and CECH-2000 series, Japan                         |
| PlayStation 4             | CUH-1000 and CUH-7000 series, Japan                          |
| PlayStation 5             | CFI-1000A disc model and CFI-1000B Digital Edition, Japan    |
| Xbox                      | Original North American launch design                        |
| Xbox 360                  | Original North American launch design; S 250GB launch design |
| Xbox One                  | Original design; S 2TB launch edition; One X launch design   |
| Xbox Series X / S         | Series X and Series S, separate 2020 launch designs          |

This is a useful starting catalog, not an exhaustive inventory of revisions, colors, storage configurations, bundles or distribution markets. All hardware entries remain `INCOMPLETE`. A named physical design can be represented without inventing a model number; a published model series does not identify every suffix or board revision. SEGA's published product designations are retained with notes distinguishing them from individual unit-label and board codes. Existing Task 8.2 keys and facts are preserved.

## Identity and market choices

Nintendo, SEGA, Sony and Microsoft are company records. Platform company links identify their brand affiliation; no actual hardware manufacturer is inferred. Xbox is a brand under Microsoft, not an extra company.

NES/Famicom, SNES/Super Famicom and Mega Drive/Genesis each share one ecosystem, with regional names available as aliases. This grouping does not assert cartridge, electrical or region-lock compatibility. Physical revisions remain models under their platform. Switch Lite/OLED share Switch; Xbox One X belongs to Xbox One; Xbox Series X and Series S share the later Xbox Series platform while remaining separate hardware entries. Nintendo Switch 2 and other systems outside Task 8.3's list are deferred.

The five commercial market records are Japan (`JP`), North America (`NA`), United States (`US`), Europe (`EU`) and Australia (`AU`). Europe is a commercial label, not a claim about European Union membership. Countries and broad markets are independent labels with no inferred membership hierarchy. The United States is not automatically substituted for North America. Market lists reflect the evidence currently linked, not exclusive or complete distribution: the original Xbox One's US link, for example, does not make it US-only. An omitted market remains unknown; no Worldwide, PAL/NTSC, Region Free or synthetic unknown record is added.

## Evidence and deliberately missing facts

Every company, platform and hardware entry cites official sources in its provenance. Commercial vocabulary has explicit project curation notes. External references identify source/provider pages without invented provider IDs; they do not authorize asset downloads.

- Nintendo platform years follow its [corporate history](https://www.nintendo.co.jp/corporate/en/history/index.html). NES and SNES years refer to their earliest Japanese identities, rather than a later regional name's launch. Hardware evidence includes the [Famicom specifications](https://www.nintendo.com/jp/famicom/hardware/index.html), [Super Famicom product page](https://www.nintendo.co.jp/n02/shvc/index.html), [GameCube instruction booklet](https://csassets.nintendo.com/noaext/image/private/t_KA_PDF/gcn101_manual_english?_a=DATC1RAAZAA0), [Wii comparison](https://en-americas-support.nintendo.com/app/answers/detail/a_id/2650/~/what-is-the-difference-between-the-models-of-wii-consoles), [European Wii identities](https://www.nintendo.com/de-de/Support/Wii/Haufig-gestellte-Fragen/Gibt-es-unterschiedliche-Modelle-der-Wii-/Gibt-es-unterschiedliche-Modelle-der-Wii-247072.html), [Switch model index](https://support.nintendo.com/tw/switch/support/modal/outline.html?width=960) and [Australian product declarations](https://www.nintendo.com/au/support/product-security/).
- SEGA's [company timeline](https://www.sega.jp/history/companyTimeline/en/) and hardware encyclopedia provide platform context and Japanese product designations. The [Master System page](https://www.sega.jp/history/hard/mastersystem/index.html) explicitly distinguishes the overseas platform introduction from the later Japanese model. The [Mega Drive 2 page](https://www.sega.jp/fb/segahard/md/md2.html) supports that specific revision's year and dimensions.
- PlayStation's [official history](https://www.playstation.com/en-us/playstation-history/1994-ps-one/) and generation pages support platform launches. Individual Japanese identities come from the [support list](https://www.playstation.com/ja-jp/support/hardware/repairs-no-longer-available/) and [manual index](https://www.playstation.com/ja-jp/support/hardware/manuals/). The CFI-1000A/B safety guides linked in the model records distinguish the disc and Digital Edition identities. Repair-support end dates are never treated as manufacturing discontinuation dates; generic redesign dates are not assigned to specific SKUs.
- Microsoft corporate facts and [Xbox launch reporting](https://news.xbox.com/en-us/2020/09/09/xbox-series-x-and-xbox-series-s-launching-november-10/) identify the Xbox ecosystems and physical designs. Each model links its own announcement or identity evidence. Launch configurations are scoped explicitly, including the [Xbox One S 2TB edition](https://news.xbox.com/en-us/2016/07/18/xbox-one-s-arrives-august-2-4/); no later capacity, all-digital revision or regulatory code is inferred.

Platform release year means first ecosystem introduction, not a date shared by every market or hardware revision. Hardware years are supplied only when evidence supports that particular design. Missing discontinuation years, manufacturers, locking, weights and measurements remain omitted. Selected Famicom, Master System and Mega Drive 2 dimensions are supported by their product pages; an approximate weight including controllers is not recast as bare-console weight. Detailed GameCube video-output differences use the existing versioned specifications field. Support-policy dates and manual copyright dates are not launch dates.

## Verification and future additions

Run `pnpm seed:validate` from the project root. The checker validates the complete graph offline and reports the counts without changing files or database rows. The unit suite also checks coverage of the planned platform families, source presence, compatibility of all committed facts with the current catalog input contract, and repeated read-only CLI execution. Structural validation cannot prove historical accuracy; review each added fact against the linked source.

For further curation, retain stable keys, cite exact evidence, keep hardware scope explicit and run the same checks. Filling unknowns or splitting a broad identity must follow the existing review rules; adding a more specific model must not silently reinterpret an old key. The future application contract remains insert-only by default, with administrator collision review, preservation of manual edits and SEED provenance. Do not change the schema to accommodate a data expansion.
