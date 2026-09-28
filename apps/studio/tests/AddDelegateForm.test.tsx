import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("shared", () => ({
  tid: (id: string) => ({ "data-testid": id }),
}));

vi.mock("ui", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Button: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Input: (props: any) => <input {...props} />,
}));

vi.mock("api/supabase", () => ({
  createBrowserSupabaseClient: () => ({}),
}));

let mockUser: { id: string } | undefined = { id: "seller-1" };
vi.mock("@/shared/application/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ user: mockUser }),
}));

vi.mock("@/features/seller-admins/infrastructure/delegateQueries", () => ({
  searchUsers: vi.fn().mockResolvedValue([]),
}));

import { AddDelegateForm } from "@/features/seller-admins/presentation/components/AddDelegateForm";

import { searchUsers } from "@/features/seller-admins/infrastructure/delegateQueries";

describe("AddDelegateForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: "seller-1" };
  });

  it("renders search input with correct test ID", () => {
    render(<AddDelegateForm onAdd={vi.fn()} />);
    expect(screen.getByTestId("delegate-search-input")).toBeInTheDocument();
  });

  it("renders permission checkboxes with correct test IDs", () => {
    render(<AddDelegateForm onAdd={vi.fn()} />);
    expect(
      screen.getByTestId("delegate-permission-orders.approve"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("delegate-permission-orders.request_proof"),
    ).toBeInTheDocument();
  });

  it("renders submit button with correct test ID", () => {
    render(<AddDelegateForm onAdd={vi.fn()} />);
    expect(screen.getByTestId("delegate-add-submit")).toBeInTheDocument();
  });

  it("submit button is disabled when no user selected", () => {
    render(<AddDelegateForm onAdd={vi.fn()} />);
    const submitBtn = screen.getByTestId("delegate-add-submit");
    expect(submitBtn).toBeDisabled();
  });

  it("toggles permission checkboxes", () => {
    render(<AddDelegateForm onAdd={vi.fn()} />);
    const checkbox = screen.getByTestId(
      "delegate-permission-orders.approve",
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });

  it("does not trigger search for short queries (< 2 chars)", async () => {
    render(<AddDelegateForm onAdd={vi.fn()} />);
    const input = screen.getByTestId("delegate-search-input");
    fireEvent.change(input, { target: { value: "a" } });
    await waitFor(() => {
      expect(searchUsers).not.toHaveBeenCalled();
    });
  });

  it("searches and displays results for valid queries", async () => {
    vi.mocked(searchUsers).mockResolvedValue([
      {
        id: "user-2",
        email: "alice@test.com",
        display_name: "Alice",
        avatar_url: null,
      },
    ]);

    render(<AddDelegateForm onAdd={vi.fn()} />);
    const input = screen.getByTestId("delegate-search-input");
    fireEvent.change(input, { target: { value: "alice" } });

    await waitFor(() => {
      expect(searchUsers).toHaveBeenCalledWith(
        expect.anything(),
        "alice",
        "seller-1",
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
  });

  it("selects a user from search results", async () => {
    vi.mocked(searchUsers).mockResolvedValue([
      {
        id: "user-2",
        email: "alice@test.com",
        display_name: "Alice",
        avatar_url: null,
      },
    ]);

    render(<AddDelegateForm onAdd={vi.fn()} />);
    const input = screen.getByTestId("delegate-search-input");
    fireEvent.change(input, { target: { value: "alice" } });

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Alice"));

    expect(screen.getByText(/selectedUser/)).toBeInTheDocument();
    expect(
      screen.getByText("Alice", { selector: "strong" }),
    ).toBeInTheDocument();
  });

  it("submits with selected user and permissions", async () => {
    vi.mocked(searchUsers).mockResolvedValue([
      {
        id: "user-2",
        email: "alice@test.com",
        display_name: "Alice",
        avatar_url: null,
      },
    ]);

    const onAdd = vi.fn();
    render(<AddDelegateForm onAdd={onAdd} />);

    const input = screen.getByTestId("delegate-search-input");
    fireEvent.change(input, { target: { value: "alice" } });

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Alice"));
    fireEvent.click(screen.getByTestId("delegate-permission-orders.approve"));
    fireEvent.click(screen.getByTestId("delegate-add-submit"));

    expect(onAdd).toHaveBeenCalledWith("user-2", ["orders.approve"]);
  });

  it("does not submit when no user is selected", () => {
    const onAdd = vi.fn();
    render(<AddDelegateForm onAdd={onAdd} />);
    fireEvent.click(screen.getByTestId("delegate-permission-orders.approve"));
    fireEvent.click(screen.getByTestId("delegate-add-submit"));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("does not submit when no permissions are checked", async () => {
    vi.mocked(searchUsers).mockResolvedValue([
      {
        id: "user-2",
        email: "alice@test.com",
        display_name: "Alice",
        avatar_url: null,
      },
    ]);

    const onAdd = vi.fn();
    render(<AddDelegateForm onAdd={onAdd} />);

    const input = screen.getByTestId("delegate-search-input");
    fireEvent.change(input, { target: { value: "alice" } });

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Alice"));
    fireEvent.click(screen.getByTestId("delegate-add-submit"));

    expect(onAdd).not.toHaveBeenCalled();
  });

  it("clears form after successful submission", async () => {
    vi.mocked(searchUsers).mockResolvedValue([
      {
        id: "user-2",
        email: "alice@test.com",
        display_name: "Alice",
        avatar_url: null,
      },
    ]);

    const onAdd = vi.fn();
    render(<AddDelegateForm onAdd={onAdd} />);

    const input = screen.getByTestId("delegate-search-input");
    fireEvent.change(input, { target: { value: "alice" } });

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Alice"));
    fireEvent.click(screen.getByTestId("delegate-permission-orders.approve"));
    fireEvent.click(screen.getByTestId("delegate-add-submit"));

    expect(onAdd).toHaveBeenCalled();

    const inputAfter = screen.getByTestId(
      "delegate-search-input",
    ) as HTMLInputElement;
    expect(inputAfter.value).toBe("");

    const checkbox = screen.getByTestId(
      "delegate-permission-orders.approve",
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    expect(
      screen.queryByTestId("delegate-selected-user"),
    ).not.toBeInTheDocument();
  });

  it("toggles permission off after toggling on", () => {
    render(<AddDelegateForm onAdd={vi.fn()} />);
    const checkbox = screen.getByTestId(
      "delegate-permission-orders.approve",
    ) as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });

  // The search used to run only inside onChange and bail out while the
  // current user was still resolving, so an email typed before the profile
  // lookup finished was silently dropped: no results, no hint, and nothing
  // re-ran when the user arrived (production E2E run e2e-20260928-0758-60c6,
  // where the lookup took 622 ms and the test typed 400 ms before it landed).
  it("runs the search once the current user resolves after typing", async () => {
    vi.mocked(searchUsers).mockResolvedValue([
      {
        id: "u-9",
        email: "delegate@example.com",
        display_name: null,
        avatar_url: null,
      },
    ]);
    mockUser = undefined;
    const view = render(<AddDelegateForm onAdd={vi.fn()} />);
    fireEvent.change(screen.getByTestId("delegate-search-input"), {
      target: { value: "delegate@example.com" },
    });
    expect(searchUsers).not.toHaveBeenCalled();

    mockUser = { id: "seller-1" };
    view.rerender(<AddDelegateForm onAdd={vi.fn()} />);

    await waitFor(() =>
      expect(searchUsers).toHaveBeenCalledWith(
        expect.anything(),
        "delegate@example.com",
        "seller-1",
      ),
    );
    expect(await screen.findByText("delegate@example.com")).toBeInTheDocument();
  });
});
