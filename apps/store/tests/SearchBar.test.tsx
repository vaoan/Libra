import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { getPendingUrlWrite } from "@/features/products/application/pendingUrlWrite";
import { SearchBar } from "@/features/products/presentation/components/SearchBar";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// nuqs's setter resolves once the URL has actually been written. That is
// later than the call: its queue flushes on a timer, never synchronously.
let resolveUrlWrite: () => void = () => {};
const mockSetQuery = vi.fn(
  () =>
    new Promise<void>((resolve) => {
      resolveUrlWrite = resolve;
    }),
);
let mockQuery = "";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("nuqs", () => ({
  useQueryState: () => [mockQuery, mockSetQuery],
  parseAsString: {
    withDefault: (val: string) => ({ defaultValue: val }),
  },
}));

vi.mock("@/features/products/domain/searchParams", () => ({
  catalogSearchParams: {
    q: { defaultValue: "" },
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SearchBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockQuery = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the search input", () => {
    render(<SearchBar />);
    expect(screen.getByTestId("search-bar-input")).toBeInTheDocument();
  });

  it("renders with the search container", () => {
    render(<SearchBar />);
    expect(screen.getByTestId("search-bar")).toBeInTheDocument();
  });

  it("has an aria-label on the input", () => {
    render(<SearchBar />);
    expect(screen.getByTestId("search-bar-input")).toHaveAttribute(
      "aria-label",
      "search",
    );
  });

  it("updates local value on input change", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-bar-input");

    fireEvent.change(input, { target: { value: "test" } });
    expect(input).toHaveValue("test");
  });

  it("debounces the query state update", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-bar-input");

    fireEvent.change(input, { target: { value: "hello" } });
    // Not called yet (debounced)
    expect(mockSetQuery).not.toHaveBeenCalled();

    // Fast-forward past debounce
    vi.advanceTimersByTime(300);
    expect(mockSetQuery).toHaveBeenCalledWith("hello", expect.any(Object));
  });

  it("sets query to null for empty string after typing", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-bar-input");

    // First type something, then clear it
    fireEvent.change(input, { target: { value: "test" } });
    vi.advanceTimersByTime(300);
    vi.clearAllMocks();

    fireEvent.change(input, { target: { value: "" } });
    vi.advanceTimersByTime(300);

    expect(mockSetQuery).toHaveBeenCalledWith(null, expect.any(Object));
  });

  it("initialises with null query treated as empty string", () => {
    mockQuery = null as unknown as string;
    render(<SearchBar />);
    const input = screen.getByTestId("search-bar-input") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("syncs local value when external query changes", async () => {
    mockQuery = "";
    const { rerender } = render(<SearchBar />);
    mockQuery = "external";
    rerender(<SearchBar />);
    await vi.waitFor(() => {
      const input = screen.getByTestId("search-bar-input") as HTMLInputElement;
      expect(input.value).toBe("external");
    });
  });

  // A debounced history.replaceState that lands while a Link navigation is
  // in flight becomes an ACTION_RESTORE in Next's router, which discards the
  // pending navigation (production E2E run e2e-20260928-0204-1049: search,
  // click a card within 300ms, page never leaves the catalog). Clicking
  // anywhere blurs the input before the click event, so flushing on blur
  // writes the URL before the navigation starts instead of during it.
  it("flushes the pending debounced search to the URL when the input loses focus", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-bar-input");

    fireEvent.change(input, { target: { value: "alpha" } });
    expect(mockSetQuery).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(mockSetQuery).toHaveBeenCalledTimes(1);
    expect(mockSetQuery).toHaveBeenCalledWith("alpha", { history: "replace" });

    // The debounce timer must not fire a second, duplicate write.
    vi.advanceTimersByTime(300);
    expect(mockSetQuery).toHaveBeenCalledTimes(1);
  });

  // Flushing on blur is not enough on its own: nuqs applies the write on a
  // timer after the call, so a click right behind the blur still started its
  // navigation first (production E2E, 2026-10-01). The write is tracked so a
  // product card can wait for it instead of racing it.
  it("tracks the blur-flushed write as pending until the URL is written", async () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-bar-input");

    fireEvent.change(input, { target: { value: "alpha" } });
    fireEvent.blur(input);

    const pending = getPendingUrlWrite();
    expect(pending).not.toBeNull();

    resolveUrlWrite();
    await pending;
    expect(getPendingUrlWrite()).toBeNull();
  });

  it("tracks the debounced write as pending too", async () => {
    render(<SearchBar />);
    fireEvent.change(screen.getByTestId("search-bar-input"), {
      target: { value: "beta" },
    });

    vi.advanceTimersByTime(300);

    const pending = getPendingUrlWrite();
    expect(pending).not.toBeNull();

    resolveUrlWrite();
    await pending;
    expect(getPendingUrlWrite()).toBeNull();
  });

  it("does not write the URL on blur when nothing is pending", () => {
    render(<SearchBar />);
    fireEvent.blur(screen.getByTestId("search-bar-input"));
    expect(mockSetQuery).not.toHaveBeenCalled();
  });
});
