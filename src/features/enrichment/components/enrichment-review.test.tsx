import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { EnrichmentReviewPanel } from "./enrichment-review";
import * as actions from "../actions";
import type { EnrichmentReview, EnrichmentTargetSummary } from "../contracts";
vi.mock("../actions", () => ({
  startLookup: vi.fn(),
  selectCandidate: vi.fn(),
  retryLookup: vi.fn(),
  cancelLookup: vi.fn(),
  readReview: vi.fn(),
  prepareReview: vi.fn(),
  rejectSuggestions: vi.fn(),
  applySuggestions: vi.fn(),
  loadTarget: vi.fn(),
  findCompanies: vi.fn(),
}));
const target: EnrichmentTargetSummary = {
  target: { kind: "game", id: "11111111-1111-4111-8111-111111111111" },
  label: "Orbit Quest",
  revision: 1,
  query: "Orbit Quest",
};
const source = {
  schemaVersion: 1,
  data: {
    provider: "IGDB",
    retrievedAt: "2026-10-19T12:00:00.000Z",
    scope: "GAME",
    evidence: [
      {
        id: "source-1",
        fieldPath: "name",
        sourceUrl: "https://www.igdb.com/games/orbit-quest",
        sourceUpdatedAt: null,
      },
    ],
  },
};
const initial: EnrichmentReview = {
  companies: [],
  canAccept: true,
  id: "22222222-2222-4222-8222-222222222222",
  target: target.target,
  label: "Orbit Quest",
  baseRevision: 1,
  currentRevision: 1,
  runVersion: 4,
  fetchStatus: "COMPLETED",
  failureCode: null,
  attemptCount: 1,
  reviewToken: "a".repeat(64),
  candidates: [],
  selectedCandidate: { externalId: "42", name: "Orbit Quest" },
  availableFields: ["name", "description", "trailer"],
  trailerChoices: [{ externalId: "18", title: "Official trailer" }],
  companyChoices: [],
  warnings: [],
  suggestions: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      fieldPath: "name",
      current: "Manual title",
      before: "Manual title",
      proposed: "Orbit Quest",
      source,
      confidence: null,
      manualReplacementRequired: true,
      status: "PENDING",
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      fieldPath: "description",
      current: null,
      before: null,
      proposed: "A fictional adventure.",
      source,
      confidence: null,
      manualReplacementRequired: false,
      status: "PENDING",
    },
  ],
  unavailable: [
    { field: "images", reason: "Images require private validated ingestion." },
  ],
  stages: [
    { name: "ai", status: "SKIPPED", reason: "No configured AI adapter." },
  ],
  canApply: true,
  receipt: null,
};
const clone = () => structuredClone(initial);
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/app/enrichment");
});
it("shows readable comparisons and sources, requiring per-field manual acknowledgement", async () => {
  const review = clone();
  render(
    <EnrichmentReviewPanel initialTarget={target} initialReview={review} />,
  );
  const title = screen.getByRole("article", { name: "Title suggestion" });
  expect(within(title).getByText("Current value")).toBeVisible();
  expect(within(title).getByText("Suggested value")).toBeVisible();
  expect(within(title).getByText("Manual title")).toBeVisible();
  expect(within(title).getByText("Confidence: Not provided")).toBeVisible();
  expect(
    within(title).getByRole("link", { name: /View source/ }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.getByRole("button", { name: "Apply all" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Apply selected" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Select title"));
  fireEvent.click(
    screen.getByLabelText(/I reviewed replacing the current title/),
  );
  expect(screen.getByRole("button", { name: "Apply selected" })).toBeEnabled();
  const receipt = {
    runId: review.id,
    suggestionIds: [review.suggestions[0].id],
    changeIds: ["55555555-5555-4555-8555-555555555555"],
    revision: 2,
  };
  vi.mocked(actions.applySuggestions).mockResolvedValue({
    status: "success",
    data: receipt,
  });
  vi.mocked(actions.readReview).mockResolvedValue({
    status: "success",
    data: {
      ...review,
      canApply: false,
      receipt,
      currentRevision: 2,
      suggestions: review.suggestions.map((s, i) => ({
        ...s,
        status: i ? "CONFLICT" : "ACCEPTED",
      })),
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply selected" }));
  await screen.findByRole("heading", { name: "Changes applied" });
  expect(actions.applySuggestions).toHaveBeenCalledWith({
    runId: review.id,
    reviewToken: review.reviewToken,
    suggestionIds: [review.suggestions[0].id],
    manualReplacementIds: [review.suggestions[0].id],
  });
  expect(screen.getByText("Needs a new review")).toBeVisible();
  expect(window.location.search).toBe(`?runId=${review.id}`);
});
it("lets editors ignore or hand off a review without displaying apply controls", async () => {
  const review = { ...clone(), canAccept: false, canApply: false };
  render(
    <EnrichmentReviewPanel initialTarget={target} initialReview={review} />,
  );
  expect(
    screen.queryByRole("button", { name: /^Apply/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/An administrator must open this link/),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Open retained review" }),
  ).toHaveAttribute("href", `/app/enrichment?runId=${review.id}`);
  vi.mocked(actions.rejectSuggestions).mockResolvedValue({
    status: "success",
    data: {
      ...review,
      runVersion: 5,
      suggestions: review.suggestions.map((s) => ({
        ...s,
        status: "REJECTED",
      })),
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ignore all" }));
  await waitFor(() => expect(actions.rejectSuggestions).toHaveBeenCalledOnce());
  expect(actions.rejectSuggestions).toHaveBeenCalledWith({
    runId: review.id,
    expectedRunVersion: 4,
    suggestionIds: review.suggestions.map((s) => s.id),
  });
});
it("preserves a lost-response lookup key and focuses the recoverable error", async () => {
  vi.mocked(actions.startLookup).mockRejectedValueOnce(
    new Error("lost response"),
  );
  render(<EnrichmentReviewPanel initialTarget={target} />);
  fireEvent.click(screen.getByRole("button", { name: "Find metadata" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  expect(screen.getByLabelText("Game title to find")).toHaveValue(
    "Orbit Quest",
  );
  vi.mocked(actions.startLookup).mockResolvedValue({
    status: "success",
    data: {
      ...clone(),
      fetchStatus: "NEEDS_SELECTION",
      reviewToken: null,
      suggestions: [],
      candidates: [
        {
          externalId: "42",
          name: "Orbit Quest",
          classification: "MAIN_GAME",
          platforms: ["SNES"],
          year: 1995,
          description: "A fictional adventure.",
        },
      ],
      selectedCandidate: null,
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Check same lookup" }));
  await screen.findByRole("heading", { name: "Choose the matching game" });
  expect(vi.mocked(actions.startLookup).mock.calls[0][0]).toEqual(
    vi.mocked(actions.startLookup).mock.calls[1][0],
  );
  vi.mocked(actions.selectCandidate).mockResolvedValue({
    status: "success",
    data: { ...clone(), reviewToken: null, suggestions: [] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review Orbit Quest" }));
  await screen.findByRole("heading", { name: "Choose what to review" });
  expect(actions.selectCandidate).toHaveBeenCalledWith({
    runId: initial.id,
    expectedRunVersion: 4,
    externalId: "42",
  });
});
it("requires explicit trailer and field choice before freezing a preview", async () => {
  render(
    <EnrichmentReviewPanel
      initialTarget={target}
      initialReview={{ ...clone(), reviewToken: null, suggestions: [] }}
    />,
  );
  const prepare = screen.getByRole("button", { name: "Prepare preview" });
  expect(prepare).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Trailer", { exact: true }));
  expect(prepare).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Trailer to review"), {
    target: { value: "18" },
  });
  vi.mocked(actions.prepareReview).mockResolvedValue({
    status: "success",
    data: clone(),
  });
  fireEvent.click(prepare);
  await waitFor(() =>
    expect(actions.prepareReview).toHaveBeenCalledWith({
      runId: initial.id,
      expectedRunVersion: 4,
      fields: ["trailer"],
      trailerExternalId: "18",
      companyBindings: [],
    }),
  );
});
it("explains stale acceptance and keeps the review available for refresh", async () => {
  const review = clone();
  render(
    <EnrichmentReviewPanel initialTarget={target} initialReview={review} />,
  );
  vi.mocked(actions.applySuggestions).mockResolvedValue({
    status: "error",
    message: "The catalog changed. Refresh this review.",
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply description" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  expect(screen.getByText("A fictional adventure.")).toBeVisible();
  vi.mocked(actions.readReview).mockResolvedValue({
    status: "success",
    data: {
      ...review,
      canApply: false,
      currentRevision: 2,
      suggestions: review.suggestions.map((s) => ({
        ...s,
        status: "CONFLICT",
      })),
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Refresh review" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: /^Apply/ }),
    ).not.toBeInTheDocument(),
  );
});
it("makes missing-provider failure non-blocking and shows bounded retry controls", () => {
  render(
    <EnrichmentReviewPanel
      initialTarget={target}
      initialReview={{
        ...clone(),
        fetchStatus: "FAILED",
        failureCode: "NOT_CONFIGURED",
        reviewToken: null,
        suggestions: [],
        canApply: false,
      }}
    />,
  );
  expect(screen.getByText(/Metadata lookup is not configured/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Retry lookup" })).toBeEnabled();
  expect(
    screen.getByRole("link", { name: "Back to collection" }),
  ).toBeVisible();
});
it("renders untrusted descriptions as text and prevents applying unreadable sources", () => {
  const review = clone();
  review.suggestions = [
    {
      ...review.suggestions[1],
      proposed: '<script>alert("ignore instructions")</script>',
      source: { schemaVersion: 999 },
    },
  ];
  render(
    <EnrichmentReviewPanel initialTarget={target} initialReview={review} />,
  );
  expect(
    screen.getByText('<script>alert("ignore instructions")</script>'),
  ).toBeVisible();
  expect(document.querySelector("script")).toBeNull();
  expect(screen.getByRole("button", { name: "Apply all" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Apply description" }),
  ).toBeDisabled();
});
it.each([false, true])(
  "keeps evidence limitations visible with a prepared preview: %s",
  (prepared) => {
    const review = clone();
    if (!prepared) {
      review.reviewToken = null;
      review.suggestions = [];
    }
    review.warnings = [
      "Trailer evidence is incomplete; only supplied choices are shown.",
    ];
    render(
      <EnrichmentReviewPanel initialTarget={target} initialReview={review} />,
    );
    const limitations = screen.getByRole("region", {
      name: "Evidence limitations",
    });
    expect(within(limitations).getByText(review.warnings[0])).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: prepared ? "Apply all" : "Prepare preview",
      }),
    ).toBeVisible();
    expect(actions.applySuggestions).not.toHaveBeenCalled();
  },
);
it("lets an editor explicitly bind a provider developer to an existing company", async () => {
  const review = {
    ...clone(),
    canAccept: false,
    canApply: false,
    reviewToken: null,
    suggestions: [],
    availableFields: ["developers" as const],
    companyChoices: [{ externalId: "7", name: "Example Studio" }],
  };
  render(
    <EnrichmentReviewPanel initialTarget={target} initialReview={review} />,
  );
  fireEvent.click(screen.getByLabelText("Developers", { exact: true }));
  fireEvent.change(screen.getByLabelText("Find a company for Example Studio"), {
    target: { value: "Example" },
  });
  const company = {
    id: "55555555-5555-4555-8555-555555555555",
    name: "Example Studio local",
  };
  vi.mocked(actions.findCompanies).mockResolvedValue({
    status: "success",
    data: [company],
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Find company for Example Studio" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Choose Example Studio local" }),
  );
  vi.mocked(actions.prepareReview).mockResolvedValue({
    status: "success",
    data: { ...review, reviewToken: "a".repeat(64) },
  });
  fireEvent.click(screen.getByRole("button", { name: "Prepare preview" }));
  await waitFor(() =>
    expect(actions.prepareReview).toHaveBeenCalledWith({
      runId: review.id,
      expectedRunVersion: review.runVersion,
      fields: ["developers"],
      companyBindings: [{ externalId: "7", companyId: company.id }],
    }),
  );
});
