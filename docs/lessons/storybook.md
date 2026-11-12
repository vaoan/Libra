# Storybook Rules

> Component-driven development using Storybook for building, testing, and documenting UI components in isolation.

---

## Overview

Storybook enables developing UI components outside the main application context, ensuring they work correctly in isolation before integration.

### Framework

Use `@storybook/nextjs-vite` for Next.js projects:

- Faster builds with Vite
- Better Vitest integration
- Full Next.js feature support (Image, Router, etc.)

---

## Setup

### Installation

```bash
# Initialize Storybook (auto-detects Next.js)
pnpm dlx storybook@latest init

# Or manually install Vite-based framework
pnpm add -D @storybook/nextjs-vite
```

### Configuration

```typescript
// .storybook/main.ts
import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-a11y",
    "@storybook/addon-interactions",
  ],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  features: {
    experimentalRSC: true, // For React Server Components
  },
};

export default config;
```

### Preview Configuration

```typescript
// .storybook/preview.ts
import type { Preview } from "@storybook/react";
import "../src/app/globals.css"; // Import global styles

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    nextjs: {
      appDirectory: true,
    },
  },
};

export default preview;
```

---

## Story Organization

### Atomic Design Hierarchy

Organize stories following Atomic Design principles:

```
src/
├── shared/presentation/components/
│   ├── atoms/           # Basic building blocks
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.stories.tsx
│   │   │   └── Button.test.tsx
│   │   ├── Input/
│   │   └── Label/
│   ├── molecules/       # Simple groups of atoms
│   │   ├── SearchField/
│   │   ├── FormField/
│   │   └── Card/
│   ├── organisms/       # Complex UI sections
│   │   ├── Navbar/
│   │   ├── Sidebar/
│   │   └── DataTable/
│   └── templates/       # Page layouts
│       ├── DashboardTemplate/
│       └── AuthTemplate/
└── features/
    └── [feature]/presentation/components/
        └── [FeatureComponent].stories.tsx
```

### Storybook Sidebar Structure

Configure the sidebar to reflect hierarchy:

```typescript
// .storybook/preview.ts
const preview: Preview = {
  parameters: {
    options: {
      storySort: {
        order: [
          "Introduction",
          "Design Tokens",
          "Atoms",
          "Molecules",
          "Organisms",
          "Templates",
          "Features",
        ],
      },
    },
  },
};
```

---

## Writing Stories

### Story Template

```typescript
// Button.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta = {
  title: "Atoms/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "ghost"],
    },
    size: {
      control: "radio",
      options: ["sm", "md", "lg"],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic variants
export const Primary: Story = {
  args: {
    variant: "primary",
    children: "Button",
  },
};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Button",
  },
};

// States
export const Loading: Story = {
  args: {
    isLoading: true,
    children: "Loading...",
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    children: "Disabled",
  },
};

// Interaction test
export const ClickTest: Story = {
  args: {
    children: "Click me",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button");
    await userEvent.click(button);
    expect(args.onClick).toHaveBeenCalled();
  },
};
```

### Feature Component Stories

```typescript
// features/auth/presentation/components/LoginForm/LoginForm.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent } from "@storybook/test";
import { LoginForm } from "./LoginForm";

const meta = {
  title: "Features/Auth/LoginForm",
  component: LoginForm,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onSubmit: async (data) => {
      console.log("Submit:", data);
    },
  },
};

export const WithError: Story = {
  args: {
    error: "Invalid email or password",
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const FilledForm: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByLabelText(/email/i), "user@example.com");
    await userEvent.type(canvas.getByLabelText(/password/i), "password123");
  },
};
```

---

## Component Development Workflow

### Storybook-Driven Development (SDD)

1. **Design** - Create component spec/design
2. **Story** - Write story first (TDD for UI)
3. **Implement** - Build component to satisfy story
4. **Document** - Add variants and docs
5. **Test** - Add interaction tests
6. **Integrate** - Use in application

### Development Process

See [Commands](#commands) for Storybook and dev commands.

### Component Checklist

Before considering a component complete:

- [ ] All variants have stories
- [ ] Loading/error states covered
- [ ] Accessibility tested
- [ ] Responsive behavior documented
- [ ] Interaction tests pass
- [ ] Docs complete

---

## Best Practices

### 1. Dumb vs Smart Components

Use Storybook for **dumb/presentational components**:

```typescript
// GOOD: Dumb component (perfect for Storybook)
interface UserCardProps {
  name: string;
  avatar: string;
  onClick?: () => void;
}

export function UserCard({ name, avatar, onClick }: UserCardProps) {
  return (
    <div onClick={onClick}>
      <img src={avatar} alt={name} />
      <span>{name}</span>
    </div>
  );
}

// BAD: Smart component (hard to story)
export function UserCard({ userId }: { userId: string }) {
  const { data: user } = useUser(userId); // Fetches data
  return (/* ... */);
}
```

### 2. Mock Data & Context

```typescript
// .storybook/preview.tsx
import { ThemeProvider } from '@/shared/presentation/theme';

const preview: Preview = {
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
};
```

### 3. Controls and Args

```typescript
export const Playground: Story = {
  args: {
    children: "Button",
    variant: "primary",
    size: "md",
    disabled: false,
    isLoading: false,
  },
  argTypes: {
    onClick: { action: "clicked" },
  },
};
```

### 4. Accessibility Addon

```typescript
// Install @storybook/addon-a11y
// Automatically checks accessibility in each story

export const AccessibleButton: Story = {
  args: {
    "aria-label": "Submit form",
    children: "Submit",
  },
};
```

---

## Integration with Testing

### Portable Stories with Vitest

```typescript
// Button.test.tsx
import { composeStories } from '@storybook/react';
import { render, screen } from '@testing-library/react';
import * as stories from './Button.stories';

const { Primary, Loading, Disabled } = composeStories(stories);

describe('Button', () => {
  it('renders primary variant', () => {
    render(<Primary />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<Loading />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('is disabled when disabled prop is true', () => {
    render(<Disabled />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### Interaction Tests

```typescript
import { expect, within, userEvent } from "@storybook/test";

export const FormSubmission: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // Fill form
    await userEvent.type(canvas.getByLabelText(/email/i), "test@example.com");
    await userEvent.type(canvas.getByLabelText(/password/i), "password123");

    // Submit
    await userEvent.click(canvas.getByRole("button", { name: /submit/i }));

    // Assert
    expect(args.onSubmit).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "password123",
    });
  },
};
```

---

## Commands

```bash
# Start Storybook
pnpm storybook

# Build static Storybook
pnpm build-storybook

# Run Storybook tests
pnpm test-storybook

# Run interaction tests in CI
pnpm test-storybook --ci
```

---

## Anti-Patterns

### 1. Avoid Smart Components in Stories

```typescript
// BAD: Component fetches its own data
export const UserProfile: Story = {
  args: { userId: "123" }, // Needs API mock setup
};

// GOOD: Pass data as props
export const UserProfile: Story = {
  args: {
    user: { id: "123", name: "John", email: "john@example.com" },
  },
};
```

### 2. Don't Skip Stories for Edge Cases

```typescript
// Include all states
export const Empty: Story = { args: { items: [] } };
export const Loading: Story = { args: { isLoading: true } };
export const Error: Story = { args: { error: "Failed to load" } };
export const WithManyItems: Story = { args: { items: generateManyItems(100) } };
```

### 3. Don't Hardcode Data

```typescript
// BAD
export const UserCard: Story = {
  args: {
    name: "John Doe",
    email: "john.doe@company.com", // Hardcoded
  },
};

// GOOD: Use factory functions
import { createMockUser } from "@/mocks/factories";

export const UserCard: Story = {
  args: createMockUser(),
};
```

---

## Resources

- [Storybook for Next.js with Vite](https://storybook.js.org/docs/get-started/frameworks/nextjs-vite)
- [Component-Driven Development](https://theideabureau.co/resources/component-driven-development-with-storybook/)
- [Atomic Design Principles](https://bradfrost.com/blog/post/atomic-web-design/)
- [Storybook Best Practices](https://storybook.js.org/docs/writing-stories/stories-for-multiple-components)

---

## Related

- [Component Patterns](./component-patterns.md) - Component structure rules
- [Testing Rules](./testing.md) - Test requirements
- [Architecture](./architecture.md) - Layer organization
