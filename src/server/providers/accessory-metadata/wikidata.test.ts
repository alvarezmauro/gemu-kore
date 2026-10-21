import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createWikidataAccessoryProvider } from "./wikidata";
import { accessoryMetadataResult, accessorySearchPage } from "./contracts";
import {
  accessoryEvidenceFixture,
  accessorySearchFixture,
} from "../../../../tests/helpers/accessory-enrichment-fixture";
const selected = {
  item: {
    provider: "WIKIDATA" as const,
    objectType: "ITEM" as const,
    externalId: "Q42",
  },
};
const context = () => ({
  signal: new AbortController().signal,
  deadlineAt: 10000,
});
const claim = (datatype: string, value: unknown, extra = {}) => ({
  rank: "normal",
  mainsnak: { snaktype: "value", datatype, datavalue: { value } },
  ...extra,
});
const date = (year = 2001, extra = {}) => ({
  time: `+${year}-01-01T00:00:00Z`,
  precision: 11,
  before: 0,
  after: 0,
  calendarmodel: "http://www.wikidata.org/entity/Q1985727",
  ...extra,
});
function product(claims: Record<string, unknown[]> = {}) {
  return {
    entities: {
      Q42: {
        id: "Q42",
        labels: { en: { language: "en", value: "Synthetic controller" } },
        descriptions: {
          en: { language: "en", value: "Sourced controller description" },
        },
        modified: "2026-10-20T12:00:00Z",
        claims,
      },
    },
  };
}
function adapter(responses: (unknown | Response)[]) {
  let time = 0;
  const transport = vi.fn(async () => {
    const data = responses.shift();
    return data instanceof Response
      ? data
      : new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
  });
  return {
    transport,
    provider: createWikidataAccessoryProvider(
      { userAgent: "GemuKore-test (https://example.com/contact)" },
      {
        transport,
        clock: {
          now: () => time,
          wallNow: () => Date.parse("2026-10-20T12:00:00Z"),
          sleep: async (ms) => {
            time += ms;
          },
        },
      },
    ),
  };
}
it("keeps optional lookup disabled without network access", async () => {
  const transport = vi.fn();
  const provider = createWikidataAccessoryProvider(null, { transport });
  expect(
    await provider.search({ query: "Controller", limit: 20 }, context()),
  ).toMatchObject({ ok: false, error: { code: "NOT_CONFIGURED" } });
  expect(transport).not.toHaveBeenCalled();
});
it("uses a fixed bounded API with encoded inputs, explicit agent and maxlag", async () => {
  const { provider, transport } = adapter([
    {
      search: [{ id: "Q42", label: "Controller", description: "Product" }],
      "search-continue": 1,
    },
  ]);
  const result = await provider.search(
    { query: "Controller & edition", limit: 20 },
    context(),
  );
  expect(result).toMatchObject({
    ok: true,
    data: {
      candidates: [{ identity: { ref: { externalId: "Q42" } } }],
      diagnostics: [{ code: "LIMIT_REACHED" }],
    },
  });
  const [url, init] = transport.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe("https://www.wikidata.org/w/api.php");
  expect(init).toMatchObject({
    method: "POST",
    redirect: "error",
    cache: "no-store",
    headers: expect.objectContaining({
      "User-Agent": "GemuKore-test (https://example.com/contact)",
    }),
  });
  const params = new URLSearchParams(String(init.body));
  expect(params.get("search")).toBe("Controller & edition");
  expect(params.get("maxlag")).toBe("5");
});
it("normalizes sourced fields and retains images/edition/rating as observations", async () => {
  const { provider } = adapter([
    product({
      P577: [claim("time", date())],
      P176: [claim("wikibase-item", { id: "Q77" })],
      P1651: [claim("external-id", "dQw4w9WgXcQ")],
      P18: [claim("commonsMedia", "Controller.png")],
      P393: [claim("string", "Special edition")],
      P444: [claim("string", "90/100")],
    }),
    {
      entities: {
        Q77: { id: "Q77", labels: { en: { language: "en", value: "Sony" } } },
      },
    },
  ]);
  expect(await provider.fetch(selected, context())).toMatchObject({
    ok: true,
    data: {
      releaseYear: { state: "present", data: { value: 2001 } },
      producers: { data: [{ value: { name: "Sony" } }] },
      videos: {
        data: [
          { value: { video: { provider: "YOUTUBE", id: "dQw4w9WgXcQ" } } },
        ],
      },
      observations: [
        { label: "Product image (source file page)" },
        { label: "Edition observation" },
        { label: "Rating observation (scale unverified)" },
      ],
    },
  });
});
it.each([
  { precision: 8 },
  { time: "+2001-13-01T00:00:00Z" },
  { time: "+2001-02-29T00:00:00Z" },
  { time: "+2001-01-00T00:00:00Z" },
  { before: 1 },
  { after: 1 },
  { calendarmodel: "http://www.wikidata.org/entity/Q1985786" },
])(
  "does not turn imprecise or uncertain dates into a release year: %j",
  async (patch) => {
    const { provider } = adapter([
      product({ P577: [claim("time", date(2001, patch))] }),
    ]);
    expect(await provider.fetch(selected, context())).toMatchObject({
      ok: true,
      data: { releaseYear: { state: "invalid" } },
    });
  },
);
it("does not infer release year from inception or apply qualified/deprecated statements", async () => {
  const { provider } = adapter([
    product({
      P571: [claim("time", date())],
      P577: [
        claim("time", date(), { qualifiers: { P3005: [] } }),
        claim("time", date(2002), { rank: "deprecated" }),
      ],
    }),
  ]);
  expect(await provider.fetch(selected, context())).toMatchObject({
    ok: true,
    data: {
      releaseYear: { state: "absent" },
      diagnostics: [{ code: "UNSUPPORTED_SCOPE" }],
    },
  });
});
it("rejects ambiguous years and ignores incorrectly typed values", async () => {
  for (const claims of [
    { P577: [claim("time", date(2001)), claim("time", date(2002))] },
    {
      P577: [
        claim("time", date(2001)),
        claim("time", { ...date(), precision: 3 }),
      ],
    },
  ]) {
    const { provider } = adapter([product(claims)]);
    expect(await provider.fetch(selected, context())).toMatchObject({
      ok: true,
      data: { releaseYear: { state: "invalid" } },
    });
  }
  const { provider } = adapter([product({ P577: [claim("string", date())] })]);
  expect(await provider.fetch(selected, context())).toMatchObject({
    ok: true,
    data: { releaseYear: { state: "absent" } },
  });
});
it("retains useful product facts if manufacturer label retrieval is unavailable", async () => {
  const { provider } = adapter([
    product({
      P577: [claim("time", date())],
      P176: [claim("wikibase-item", { id: "Q77" })],
    }),
    new Response(null, { status: 500 }),
  ]);
  expect(await provider.fetch(selected, context())).toMatchObject({
    ok: true,
    data: {
      description: { state: "present" },
      releaseYear: { state: "present" },
      producers: { state: "invalid" },
      diagnostics: [{ section: "producer", code: "INVALID_OPTIONAL" }],
    },
  });
});
it.each([
  new Response(null, { status: 429, headers: { "Retry-After": "7" } }),
  { error: { code: "maxlag" } },
])("retains rate limits for explicit shared-run retry", async (response) => {
  const { provider, transport } = adapter([response]);
  expect(
    await provider.search({ query: "Controller", limit: 20 }, context()),
  ).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
  expect(transport).toHaveBeenCalledTimes(1);
});
it("rejects missing or mismatched selected identities and malformed critical search data", async () => {
  for (const response of [
    { entities: { Q42: { missing: "" } } },
    { entities: { Q42: { ...product().entities.Q42, id: "Q99" } } },
  ]) {
    const { provider } = adapter([response]);
    expect(await provider.fetch(selected, context())).toMatchObject({
      ok: false,
    });
  }
  const { provider } = adapter([
    {
      search: [
        { id: "Q42", label: "A" },
        { id: "Q42", label: "B" },
      ],
    },
  ]);
  expect(
    await provider.search({ query: "Controller", limit: 20 }, context()),
  ).toMatchObject({ ok: false, error: { code: "INVALID_RESPONSE" } });
});
it("keeps shared HTTP bounds and cancellation in force", async () => {
  for (const response of [
    new Response("{}", { headers: { "Content-Type": "text/html" } }),
    new Response("{}", {
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(513 * 1024),
      },
    }),
    new Response(null, {
      status: 302,
      headers: { Location: "https://example.com" },
    }),
  ]) {
    const { provider } = adapter([response]);
    expect(
      await provider.search({ query: "Controller", limit: 20 }, context()),
    ).toMatchObject({ ok: false, error: { code: "INVALID_RESPONSE" } });
  }
  const { provider, transport } = adapter([]);
  const controller = new AbortController();
  controller.abort();
  expect(
    await provider.fetch(selected, { ...context(), signal: controller.signal }),
  ).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
  expect(transport).not.toHaveBeenCalled();
});
it("rejects unresolved evidence, duplicate choices, unsafe observations and unknown contract fields", () => {
  const result = accessoryEvidenceFixture();
  expect(accessoryMetadataResult.safeParse(result).success).toBe(true);
  expect(
    accessoryMetadataResult.safeParse({
      ...result,
      identity: { ...result.identity, evidenceIds: ["missing"] },
    }).success,
  ).toBe(false);
  expect(
    accessoryMetadataResult.safeParse({
      ...result,
      observations: [
        { ...result.observations[0], sourceUrl: "javascript:alert(1)" },
      ],
    }).success,
  ).toBe(false);
  expect(
    accessoryMetadataResult.safeParse({
      ...result,
      producers: {
        state: "present",
        data: [
          ...("data" in result.producers ? result.producers.data : []),
          ...("data" in result.producers ? result.producers.data : []),
        ],
      },
    }).success,
  ).toBe(false);
  expect(
    accessorySearchPage.safeParse({
      ...accessorySearchFixture(),
      role: "ADMIN",
    }).success,
  ).toBe(false);
});
it("does not discard valid product fields because optional claims or description are malformed", async () => {
  const record = product({ P577: [claim("time", date())], P999: [] });
  const raw = {
    entities: {
      Q42: {
        ...record.entities.Q42,
        descriptions: { en: { value: 123 } },
        claims: { ...record.entities.Q42.claims, P18: "not an array" },
      },
    },
  };
  const { provider } = adapter([raw]);
  expect(await provider.fetch(selected, context())).toMatchObject({
    ok: true,
    data: {
      description: { state: "invalid" },
      releaseYear: { state: "present", data: { value: 2001 } },
    },
  });
});
it("supports Wikidata multilingual default labels for products and manufacturers", async () => {
  const record = product({ P176: [claim("wikibase-item", { id: "Q77" })] });
  const raw = {
    entities: {
      Q42: {
        ...record.entities.Q42,
        labels: { mul: { language: "mul", value: "Synthetic controller" } },
      },
    },
  };
  const { provider } = adapter([
    raw,
    {
      entities: {
        Q77: {
          id: "Q77",
          labels: {
            en: { language: "mul", value: "Sony", "for-language": "en" },
          },
        },
      },
    },
  ]);
  expect(await provider.fetch(selected, context())).toMatchObject({
    ok: true,
    data: {
      identity: { name: "Synthetic controller" },
      producers: { data: [{ value: { name: "Sony" } }] },
    },
  });
});
it("drops oversized optional image links without losing useful product facts", async () => {
  const { provider } = adapter([
    product({
      P18: [claim("commonsMedia", "X".repeat(3000))],
      P577: [claim("time", date())],
    }),
  ]);
  expect(await provider.fetch(selected, context())).toMatchObject({
    ok: true,
    data: {
      releaseYear: { state: "present" },
      description: { state: "present" },
      observations: [],
      diagnostics: [{ section: "observations", code: "INVALID_OPTIONAL" }],
    },
  });
});
