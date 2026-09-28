import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("shared", () => ({
  tid: (id: string) => ({ "data-testid": id }),
  i18nField: (obj: Record<string, unknown>, field: string, locale: string) =>
    obj[`${field}_${locale}`] ?? obj[`${field}_en`],
  getCoverImageUrl: (images: unknown) => {
    if (!Array.isArray(images) || images.length === 0) return null;
    const cover =
      (images as { is_cover?: boolean }[]).find(
        (img) => img.is_cover === true,
      ) ?? images[0];
    if (typeof cover === "string") return cover;
    if (cover && typeof cover === "object" && "url" in cover) {
      return String((cover as { url: string }).url);
    }
    return null;
  },
  formatPrice: (amount: number, currency: string) =>
    `${amount.toLocaleString()} ${currency}`,
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} data-testid="product-image" />
  ),
}));

// The row links through the locale-aware Link (next-intl), not next/link.
vi.mock("@/shared/infrastructure/i18n", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("ui", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

import { ProductTableRow } from "@/features/products/presentation/components/ProductTableRow";

let onToggle: Mock;
let onDelete: Mock;

const mockProduct = {
  id: "p1",
  name_en: "Test Product",
  name_es: "Producto de Prueba",
  type: "merch" as const,
  category: "merch" as const,
  price: 50_000,
  currency: "COP",
  is_active: true,
  featured: false,
  sort_order: 1,
  images: ["https://example.com/img.jpg"],
  quantity_available: 10,
  quantity_sold: 2,
  discount_percent: null,
};

const defaultProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  product: mockProduct as any,
  isOddRow: false,
  canReorder: false,
  canUpdate: true,
  canDelete: true,
  canManageDelegates: true,
  dragProvided: {
    innerRef: () => null,
    draggableProps: {},
    dragHandleProps: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
  isDragging: false,
  get onToggle() {
    return onToggle;
  },
  get onDelete() {
    return onDelete;
  },
};

describe("ProductTableRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onToggle = vi.fn();
    onDelete = vi.fn();
  });

  it("renders product name", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow {...defaultProps} />
        </tbody>
      </table>,
    );
    expect(screen.getByText("Test Product")).toBeInTheDocument();
  });

  it("renders product image", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow {...defaultProps} />
        </tbody>
      </table>,
    );
    expect(screen.getByTestId("product-image")).toBeInTheDocument();
  });

  it("renders price", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow {...defaultProps} />
        </tbody>
      </table>,
    );
    // Price should be formatted as COP
    expect(screen.getByText(/50/)).toBeInTheDocument();
  });

  it("renders type and category badges", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow {...defaultProps} />
        </tbody>
      </table>,
    );
    // Category or type text present
    expect(screen.getByText("categories.merch")).toBeInTheDocument();
  });

  it("renders active toggle", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow {...defaultProps} />
        </tbody>
      </table>,
    );
    expect(screen.getByTestId("toggle-active-p1")).toBeInTheDocument();
  });

  it("toggles active state when switch is clicked", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow {...defaultProps} />
        </tbody>
      </table>,
    );
    fireEvent.click(screen.getByTestId("toggle-active-p1"));
    expect(onToggle).toHaveBeenCalledWith("p1", "is_active", false);
  });

  it("shows confirm button after clicking delete, then deletes on confirm", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow {...defaultProps} />
        </tbody>
      </table>,
    );
    // First click opens confirm mode
    fireEvent.click(screen.getByTestId("delete-product-p1"));
    // Second click confirms
    fireEvent.click(screen.getByTestId("confirm-delete-p1"));
    expect(onDelete).toHaveBeenCalledWith("p1");
  });

  it("cancels delete when cancel button is clicked", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow {...defaultProps} />
        </tbody>
      </table>,
    );
    fireEvent.click(screen.getByTestId("delete-product-p1"));
    fireEvent.click(screen.getByTestId("cancel-delete-p1"));
    // Should be back to normal state
    expect(screen.getByTestId("delete-product-p1")).toBeInTheDocument();
  });

  it("renders drag handle when canReorder is true", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow
            {...defaultProps}
            canReorder={true}
            dragProvided={
              {
                innerRef: () => null,
                draggableProps: {},
                dragHandleProps: {},
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any
            }
          />
        </tbody>
      </table>,
    );
    expect(screen.getByLabelText("products.dragToReorder")).toBeInTheDocument();
  });

  it("applies dragging styles when isDragging", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow {...defaultProps} isDragging={true} />
        </tbody>
      </table>,
    );
    const row = screen.getByTestId("product-row-p1");
    expect(row).toHaveAttribute("data-dragging", "true");
  });

  it("toggles featured state", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow {...defaultProps} />
        </tbody>
      </table>,
    );
    fireEvent.click(screen.getByTestId("toggle-featured-p1"));
    expect(onToggle).toHaveBeenCalledWith("p1", "featured", true);
  });

  it("renders without image when images is empty", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow
            {...defaultProps}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            product={{ ...mockProduct, images: [] } as any}
          />
        </tbody>
      </table>,
    );
    expect(screen.queryByTestId("product-image")).not.toBeInTheDocument();
  });

  it("renders delegate badge when delegateCount > 0", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow
            {...defaultProps}
            canManageDelegates={true}
            delegateCount={3}
          />
        </tbody>
      </table>,
    );
    expect(screen.getByLabelText("products.hasDelegates")).toBeInTheDocument();
  });

  it("does not render delegate badge when delegateCount is 0", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow
            {...defaultProps}
            canManageDelegates={true}
            delegateCount={0}
          />
        </tbody>
      </table>,
    );
    expect(
      screen.queryByLabelText("products.hasDelegates"),
    ).not.toBeInTheDocument();
  });

  it("does not render delegate badge when delegateCount is undefined", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow {...defaultProps} canManageDelegates={true} />
        </tbody>
      </table>,
    );
    expect(
      screen.queryByLabelText("products.hasDelegates"),
    ).not.toBeInTheDocument();
  });

  it("does not render delegate badge when canManageDelegates is false", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow
            {...defaultProps}
            canManageDelegates={false}
            delegateCount={3}
          />
        </tbody>
      </table>,
    );
    expect(
      screen.queryByLabelText("products.hasDelegates"),
    ).not.toBeInTheDocument();
  });

  it("renders manage delegates button when canManageDelegates is true", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow {...defaultProps} canManageDelegates={true} />
        </tbody>
      </table>,
    );
    expect(screen.getByTestId("manage-delegates-p1")).toBeInTheDocument();
  });

  it("does not render manage delegates button when canManageDelegates is false", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow {...defaultProps} canManageDelegates={false} />
        </tbody>
      </table>,
    );
    expect(screen.queryByTestId("manage-delegates-p1")).not.toBeInTheDocument();
  });

  it("manage delegates button links to correct URL", () => {
    render(
      <table>
        <tbody>
          <ProductTableRow {...defaultProps} canManageDelegates={true} />
        </tbody>
      </table>,
    );
    const link = screen.getByTestId("manage-delegates-p1").closest("a"); // eslint-disable-line testing-library/no-node-access -- checking link href requires DOM traversal
    expect(link).toHaveAttribute("href", "/products/p1/delegates");
  });

  it("uses cover image when is_cover is set", () => {
    const productWithCover = {
      ...mockProduct,
      images: [
        { url: "https://example.com/a.jpg", alt: "", sort_order: 0 },
        {
          url: "https://example.com/b.jpg",
          alt: "",
          sort_order: 1,
          is_cover: true,
        },
      ],
    };
    render(
      <table>
        <tbody>
          <ProductTableRow
            {...defaultProps}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            product={productWithCover as any}
          />
        </tbody>
      </table>,
    );
    const img = screen.getByTestId("product-image");
    expect(img).toHaveAttribute("src", "https://example.com/b.jpg");
  });
});
