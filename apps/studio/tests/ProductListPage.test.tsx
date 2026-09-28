import { render, screen } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("shared", () => ({
  tid: (id: string) => ({ "data-testid": id }),
}));

const mockHasPermission = vi.fn((permission: string) =>
  [
    "products.read",
    "products.create",
    "products.update",
    "products.delete",
  ].includes(permission),
);

vi.mock("auth/client", () => ({
  useCurrentUserPermissions: () => ({
    hasPermission: mockHasPermission,
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

// The locale-aware Link (next-intl): a locale-less next/link href relies on
// the middleware's 307 to add the locale, and under production latency that
// redirect raced the client navigation and bounced the seller back to the
// list (production E2E run e2e-20260928-0136-b561). Rendering it with a
// marker lets the test prove the component uses this one.
vi.mock("@/shared/infrastructure/i18n", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, href, ...props }: any) => (
    <a href={href} data-i18n-link="true" {...props}>
      {children}
    </a>
  ),
}));

vi.mock("ui", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("nuqs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nuqs")>();
  return {
    ...actual,
    useQueryStates: () => [{ type: "", category: "", q: "" }, vi.fn()],
  };
});

vi.mock("@/features/products/application/hooks/useProducts", () => ({
  useProducts: () => ({
    data: [{ id: "1", name_en: "Product 1" }],
    isLoading: false,
  }),
}));

vi.mock("@/shared/application/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ user: { id: "seller-1" } }),
}));

vi.mock(
  "@/features/seller-admins/application/hooks/useDelegateCountsByProduct",
  () => ({
    useDelegateCountsByProduct: () => ({ data: {} }),
  }),
);

vi.mock("@/features/orders/application/hooks/usePendingOrderCount", () => ({
  usePendingOrderCount: () => ({
    data: 0,
  }),
}));

vi.mock("@/features/products/presentation/components/ProductFilters", () => ({
  ProductFilters: () => <div data-testid="product-filters" />,
}));

vi.mock("@/features/products/presentation/components/ProductTable", () => ({
  ProductTable: () => <div data-testid="product-table" />,
}));

import { ProductListPage } from "@/shared/presentation/pages/ProductListPage";

describe("ProductListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockImplementation((permission: string) =>
      [
        "products.read",
        "products.create",
        "products.update",
        "products.delete",
      ].includes(permission),
    );
  });

  it("renders page with title", () => {
    render(<ProductListPage />);
    expect(screen.getByTestId("products-title")).toBeInTheDocument();
  });

  it("renders product filters", () => {
    render(<ProductListPage />);
    expect(screen.getByTestId("product-filters")).toBeInTheDocument();
  });

  it("renders product table", () => {
    render(<ProductListPage />);
    expect(screen.getByTestId("product-table")).toBeInTheDocument();
  });

  it("renders add product button", () => {
    render(<ProductListPage />);
    expect(screen.getByTestId("new-product-button")).toBeInTheDocument();
  });

  it("links to the new-product page with the locale-aware Link", () => {
    mockHasPermission.mockReturnValue(true);
    render(<ProductListPage />);
    const anchor = screen.getByRole("link", { name: /products\.newProduct/ });
    expect(anchor).toHaveAttribute("data-i18n-link", "true");
    expect(anchor).toHaveAttribute("href", "/products/new");
  });
});
