import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { trackPendingUrlWrite } from "@/features/products/application/pendingUrlWrite";
import { useAddToCart } from "@/shared/application/cart/useAddToCart";
import type { Product } from "@/features/products/domain/types";
import { ProductCard } from "@/features/products/presentation/components/ProductCard";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockHandleAddToCart = vi.fn(
  (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault();
    e.stopPropagation();
  },
);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params?.count !== undefined) return `${key}:${params.count}`;
    return key;
  },
  useLocale: () => "en",
}));

const mockRouterPush = vi.fn();

vi.mock("@/shared/infrastructure/i18n", () => ({
  useRouter: () => ({ push: mockRouterPush }),
  Link: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/shared/application/cart/useAddToCart", () => ({
  useAddToCart: vi.fn(() => ({
    isAdded: false,
    quantityInCart: 0,
    hasReachedStockLimit: false,
    handleAddToCart: mockHandleAddToCart,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "test-product-1",
    slug: "test-product",
    name_en: "Cool Fursuit",
    name_es: "Traje Genial",
    description_en: "A really cool fursuit",
    description_es: "Un traje genial",
    type: "merch",
    category: "merch",
    price: 25,
    currency: "USD",
    max_quantity: null,
    is_active: true,
    created_at: "2025-01-01",
    event_id: null,
    long_description_en: "",
    long_description_es: "",
    tagline_en: "",
    tagline_es: "",
    compare_at_price: null,
    tags: [],
    rating: null,
    review_count: 0,
    images: [],
    sections: [],
    updated_at: "2025-01-01",
    featured: false,
    seller_id: null,
    refundable: null,
    sort_order: 0,
    ...overrides,
  } as Product;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProductCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders product name", () => {
    const product = makeProduct({ name_en: "My Product" });
    render(<ProductCard product={product} />);

    expect(screen.getByTestId("product-card-name")).toHaveTextContent(
      "My Product",
    );
  });

  it("renders product price", () => {
    const product = makeProduct({ price: 25 });
    render(<ProductCard product={product} />);

    expect(screen.getByTestId("product-card-price")).toBeInTheDocument();
  });

  it("renders product card article element", () => {
    render(<ProductCard product={makeProduct()} />);

    expect(screen.getByTestId("product-card")).toBeInTheDocument();
  });

  it("renders add to cart button", () => {
    render(<ProductCard product={makeProduct()} />);

    expect(screen.getByTestId("product-card-add-to-cart")).toBeInTheDocument();
  });

  it("calls handleAddToCart when add to cart button is clicked", () => {
    render(<ProductCard product={makeProduct()} />);

    const button = screen.getByTestId("product-card-add-to-cart");
    fireEvent.click(button);

    expect(mockHandleAddToCart).toHaveBeenCalledTimes(1);
  });

  it("renders as default variant by default", () => {
    render(<ProductCard product={makeProduct()} />);

    expect(screen.getByTestId("product-card")).toHaveAttribute(
      "data-variant",
      "default",
    );
  });

  it("renders as featured variant when specified", () => {
    render(<ProductCard product={makeProduct()} variant="featured" />);

    expect(screen.getByTestId("product-card")).toHaveAttribute(
      "data-variant",
      "featured",
    );
  });

  it("disables add to cart when product is not active", () => {
    const product = makeProduct({ is_active: false });
    // Re-mock useAddToCart to reflect disabled state from isProductAvailable
    // The actual disabled state is computed in the component from isProductAvailable
    render(<ProductCard product={product} />);

    const button = screen.getByTestId("product-card-add-to-cart");
    expect(button).toBeDisabled();
  });

  it("disables add to cart when product is out of stock", () => {
    const product = makeProduct({ max_quantity: 0 });
    render(<ProductCard product={product} />);

    const button = screen.getByTestId("product-card-add-to-cart");
    expect(button).toBeDisabled();
  });

  it("disables add to cart when the cart already reached the stock limit", () => {
    vi.mocked(useAddToCart).mockReturnValue({
      isAdded: false,
      quantityInCart: 2,
      hasReachedStockLimit: true,
      handleAddToCart: mockHandleAddToCart,
    });

    render(<ProductCard product={makeProduct({ max_quantity: 2 })} />);

    expect(screen.getByTestId("product-card-add-to-cart")).toBeDisabled();
  });

  it("renders a link to the product detail page", () => {
    const product = makeProduct({ id: "abc-123", name_en: "Test Prod" });
    render(<ProductCard product={product} />);

    const link = screen.getByTestId("product-card-link");
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("/products/abc-123/"),
    );
  });

  it("lets the link navigate normally when no search write is pending", () => {
    render(<ProductCard product={makeProduct({ id: "abc-123" })} />);

    const wasNotPrevented = fireEvent.click(
      screen.getByTestId("product-card-link"),
    );

    expect(wasNotPrevented).toBe(true);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  // A search URL write that lands while this navigation is in flight makes
  // Next discard the navigation (production E2E, 2026-10-01: the click
  // happened, the page never left the catalog). Waiting for the write first
  // puts the navigation after it, where it wins.
  it("navigates only after a pending search write has landed", async () => {
    let finishWrite!: () => void;
    trackPendingUrlWrite(
      new Promise<void>((resolve) => {
        finishWrite = resolve;
      }),
    );
    render(
      <ProductCard product={makeProduct({ id: "abc-123", name_en: "Test" })} />,
    );

    const wasNotPrevented = fireEvent.click(
      screen.getByTestId("product-card-link"),
    );

    expect(wasNotPrevented).toBe(false);
    expect(mockRouterPush).not.toHaveBeenCalled();

    finishWrite();

    await vi.waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith(
        expect.stringContaining("/products/abc-123/"),
      ),
    );
  });

  it("leaves modifier clicks to the browser even while a write is pending", async () => {
    let finishWrite!: () => void;
    const write = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    trackPendingUrlWrite(write);
    render(<ProductCard product={makeProduct({ id: "abc-123" })} />);

    const wasNotPrevented = fireEvent.click(
      screen.getByTestId("product-card-link"),
      { ctrlKey: true },
    );

    expect(wasNotPrevented).toBe(true);
    expect(mockRouterPush).not.toHaveBeenCalled();

    // Settle it so the next test starts with nothing pending.
    finishWrite();
    await write;
  });

  it("sets data-product-id attribute", () => {
    const product = makeProduct({ id: "prod-42" });
    render(<ProductCard product={product} />);

    expect(screen.getByTestId("product-card")).toHaveAttribute(
      "data-product-id",
      "prod-42",
    );
  });
});
