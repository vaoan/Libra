import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSetParams = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("shared", () => ({
  tid: (id: string) => ({ "data-testid": id }),
}));

vi.mock("ui", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock("nuqs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nuqs")>();
  return {
    ...actual,
    useQueryStates: () => [{ type: "", category: "", q: "" }, mockSetParams],
  };
});

import { ProductFilters } from "@/features/products/presentation/components/ProductFilters";

describe("ProductFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders search input", () => {
    render(<ProductFilters />);
    expect(screen.getByTestId("product-search")).toBeInTheDocument();
  });

  it("renders type filter pills", () => {
    render(<ProductFilters />);
    expect(screen.getByTestId("type-filter-all")).toBeInTheDocument();
  });

  it("renders category filter pills", () => {
    render(<ProductFilters />);
    expect(screen.getByTestId("category-filter-all")).toBeInTheDocument();
  });

  it("clicking type pill updates params", () => {
    render(<ProductFilters />);
    fireEvent.click(screen.getByTestId("type-filter-all"));
    expect(mockSetParams).toHaveBeenCalled();
  });

  it("clicking category pill updates params", () => {
    render(<ProductFilters />);
    fireEvent.click(screen.getByTestId("category-filter-all"));
    expect(mockSetParams).toHaveBeenCalled();
  });

  it("search input debounces and updates params", async () => {
    render(<ProductFilters />);
    const input = screen.getByTestId("product-search");
    fireEvent.change(input, { target: { value: "test" } });

    // Advance past debounce
    vi.advanceTimersByTime(400);

    expect(mockSetParams).toHaveBeenCalled();
  });

  // The debounce effect runs on mount too. Writing q=null to a URL that has
  // no q is a history.replaceState Next turns into ACTION_RESTORE, which
  // discards any navigation still in flight -- in production the "New
  // product" click 300ms after the list rendered never left the list
  // (CI production E2E run e2e-20260928-0356-7305).
  it("does not write the URL on mount when the search box already matches it", () => {
    render(<ProductFilters />);
    vi.advanceTimersByTime(1000);
    expect(mockSetParams).not.toHaveBeenCalled();
  });
});
