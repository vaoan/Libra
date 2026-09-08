import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("shared", () => ({
  tid: (id: string) => ({ "data-testid": id }),
}));

vi.mock("@/shared/infrastructure/config", () => ({
  appUrls: {
    store: "/store",
    payments: "/payments",
    auth: "/auth",
    admin: "/admin",
    studio: "/studio",
    landing: "/",
  },
}));

import { CtaSection } from "@/features/home/presentation/components/CtaSection";
import { FeaturesSection } from "@/features/home/presentation/components/FeaturesSection";
import { HeroSection } from "@/features/home/presentation/components/HeroSection";
import { RolesSection } from "@/features/home/presentation/components/RolesSection";

import { LandingPage } from "@/features/home/presentation/pages/LandingPage";

describe("HomeSections", () => {
  it("renders the CTA links", () => {
    render(<CtaSection />);

    expect(screen.getByTestId("cta-section")).toBeInTheDocument();
    expect(screen.getByTestId("final-cta")).toHaveAttribute("href", "/store");
    expect(screen.getByTestId("final-payments")).toHaveAttribute(
      "href",
      "/payments",
    );
  });

  it("renders the landing category pills", () => {
    render(<FeaturesSection />);

    expect(screen.getByTestId("features-section")).toBeInTheDocument();
    expect(screen.getByTestId("category-commissions")).toBeInTheDocument();
    expect(screen.getByTestId("category-digital")).toBeInTheDocument();
  });

  it("renders both role cards — artists has coming-soon badge, fans has store link", () => {
    render(<RolesSection />);

    expect(screen.getByTestId("roles-section")).toBeInTheDocument();
    expect(screen.getByTestId("role-artists")).toBeInTheDocument();
    expect(screen.getByTestId("role-fans")).toBeInTheDocument();
    // Artists card is "coming soon" — no link, only the fans card links to the store
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/store");
  });

  it("renders hero section with heading and CTA link", () => {
    render(<HeroSection />);

    expect(screen.getByTestId("hero-section")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("hero-cta")).toHaveAttribute("href", "/store");
  });

  it("renders landing page with all sections", () => {
    render(<LandingPage />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByTestId("hero-section")).toBeInTheDocument();
    expect(screen.getByTestId("cta-section")).toBeInTheDocument();
  });
});
