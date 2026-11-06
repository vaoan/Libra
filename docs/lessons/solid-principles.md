# SOLID Principles

This project follows SOLID principles for maintainable, scalable code.

---

## S - Single Responsibility Principle

> "A class/module should have only one reason to change."

### Rule

Each component, hook, service, or utility should do **one thing well**.

### Examples

```typescript
// BAD: Component does too much
function UserDashboard() {
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // Fetches user data
  useEffect(() => { /* fetch user */ }, []);
  // Fetches orders
  useEffect(() => { /* fetch orders */ }, []);
  // Fetches notifications
  useEffect(() => { /* fetch notifications */ }, []);
  // Handles user update
  const updateUser = () => { /* ... */ };
  // Handles order cancellation
  const cancelOrder = () => { /* ... */ };
  // Marks notification as read
  const markAsRead = () => { /* ... */ };

  return (/* 200 lines of JSX */);
}

// GOOD: Split into focused components
function UserDashboard() {
  return (
    <DashboardLayout>
      <UserProfile />
      <UserOrders />
      <UserNotifications />
    </DashboardLayout>
  );
}

function UserProfile() {
  const { user, updateUser } = useUser();
  return (/* user profile JSX */);
}

function UserOrders() {
  const { orders, cancelOrder } = useOrders();
  return (/* orders JSX */);
}
```

```typescript
// BAD: Service does multiple things
class UserService {
  async getUser() {}
  async updateUser() {}
  async sendEmail() {} // Not user-related
  async generateReport() {} // Not user-related
  async uploadAvatar() {} // Could be separate
}

// GOOD: Focused services
class UserService {
  async getUser() {}
  async updateUser() {}
}

class EmailService {
  async send() {}
}

class ReportService {
  async generate() {}
}

class AvatarService {
  async upload() {}
}
```

### Application in This Project

| Layer      | SRP Application                  |
| ---------- | -------------------------------- |
| Components | One UI concern per component     |
| Hooks      | One feature/behavior per hook    |
| Services   | One domain concept per service   |
| Utils      | One utility purpose per function |

---

## O - Open/Closed Principle

> "Open for extension, closed for modification."

### Rule

Design components and functions to be **extended without modifying** existing code.

### Examples

```typescript
// BAD: Must modify to add new button types
function Button({ type, children }) {
  if (type === 'primary') {
    return <button className="bg-blue-500">{children}</button>;
  }
  if (type === 'secondary') {
    return <button className="bg-gray-500">{children}</button>;
  }
  if (type === 'danger') {
    return <button className="bg-red-500">{children}</button>;
  }
  // Must add new if-block for each type
}

// GOOD: Extend via configuration
const buttonVariants = {
  primary: 'bg-blue-500 text-white',
  secondary: 'bg-gray-500 text-white',
  danger: 'bg-red-500 text-white',
  // Easy to add new variants
};

interface ButtonProps {
  variant?: keyof typeof buttonVariants;
  className?: string;
  children: ReactNode;
}

function Button({ variant = 'primary', className, children }: ButtonProps) {
  return (
    <button className={cn(buttonVariants[variant], className)}>
      {children}
    </button>
  );
}
```

```typescript
// BAD: Must modify for each new notification type
function sendNotification(type: string, message: string) {
  if (type === "email") {
    // send email
  } else if (type === "sms") {
    // send sms
  } else if (type === "push") {
    // send push
  }
}

// GOOD: Strategy pattern - extend via new implementations
interface NotificationStrategy {
  send(message: string): Promise<void>;
}

class EmailNotification implements NotificationStrategy {
  async send(message: string) {
    /* email logic */
  }
}

class SmsNotification implements NotificationStrategy {
  async send(message: string) {
    /* sms logic */
  }
}

class PushNotification implements NotificationStrategy {
  async send(message: string) {
    /* push logic */
  }
}

// Add new notification types without modifying existing code
class SlackNotification implements NotificationStrategy {
  async send(message: string) {
    /* slack logic */
  }
}
```

### Application in This Project

- Use composition over conditionals
- Design prop interfaces to be extensible
- Use strategy/factory patterns for varying behaviors
- Prefer configuration objects over if/else chains

---

## L - Liskov Substitution Principle

> "Subtypes must be substitutable for their base types."

### Rule

Derived components/classes should be usable wherever their base type is expected.

### Examples

```typescript
// BAD: Derived type changes expected behavior
interface Button {
  onClick: () => void;
  disabled?: boolean;
}

// This violates LSP - SubmitButton ignores onClick
function SubmitButton({ onClick, disabled }: Button) {
  // Ignores onClick, always submits form!
  return <button type="submit" disabled={disabled}>Submit</button>;
}

// GOOD: Derived types honor the contract
function SubmitButton({ onClick, disabled }: Button) {
  const handleClick = () => {
    onClick(); // Respect the contract
  };
  return <button type="submit" onClick={handleClick} disabled={disabled}>Submit</button>;
}
```

```typescript
// BAD: Child component breaks parent's expectations
interface ListItem {
  id: string;
  onClick: (id: string) => void;
}

// ReadOnlyListItem silently ignores onClick - violates LSP
function ReadOnlyListItem({ id }: ListItem) {
  return <li>{id}</li>; // onClick ignored!
}

// GOOD: Be explicit about differences
interface ListItemBase {
  id: string;
}

interface ClickableListItem extends ListItemBase {
  onClick: (id: string) => void;
}

interface ReadOnlyListItem extends ListItemBase {
  // No onClick - explicitly different type
}
```

### Application in This Project

- Components extending base types must honor all props
- Custom hooks returning standard shapes must be compatible
- Repository implementations must fulfill interface contracts

---

## I - Interface Segregation Principle

> "Clients should not depend on interfaces they don't use."

### Rule

Create **small, focused interfaces** rather than large, monolithic ones.

### Examples

```typescript
// BAD: One large interface forces unused dependencies
interface UserFormProps {
  user: User;
  onSave: (user: User) => void;
  onDelete: (id: string) => void;
  onChangePassword: (password: string) => void;
  onUploadAvatar: (file: File) => void;
  onSendVerification: () => void;
  onExportData: () => void;
}

// Component only needs some props but must accept all
function UserNameEditor({ user, onSave }: UserFormProps) {
  // Doesn't use onDelete, onChangePassword, etc.
}

// GOOD: Segregated interfaces
interface UserEditorProps {
  user: User;
  onSave: (user: User) => void;
}

interface UserDeleteProps {
  userId: string;
  onDelete: (id: string) => void;
}

interface PasswordChangeProps {
  onChangePassword: (password: string) => void;
}

// Components only depend on what they need
function UserNameEditor({ user, onSave }: UserEditorProps) {}
function DeleteUserButton({ userId, onDelete }: UserDeleteProps) {}
```

```typescript
// BAD: Repository with too many methods
interface IUserRepository {
  findAll(): Promise<User[]>;
  findById(id: string): Promise<User>;
  create(data: CreateUserDTO): Promise<User>;
  update(id: string, data: UpdateUserDTO): Promise<User>;
  delete(id: string): Promise<void>;
  findByEmail(email: string): Promise<User>;
  findByRole(role: string): Promise<User[]>;
  countByStatus(status: string): Promise<number>;
  exportToCsv(): Promise<string>;
  importFromCsv(data: string): Promise<void>;
}

// GOOD: Segregated repositories
interface IUserReader {
  findAll(): Promise<User[]>;
  findById(id: string): Promise<User>;
  findByEmail(email: string): Promise<User>;
}

interface IUserWriter {
  create(data: CreateUserDTO): Promise<User>;
  update(id: string, data: UpdateUserDTO): Promise<User>;
  delete(id: string): Promise<void>;
}

interface IUserExporter {
  exportToCsv(): Promise<string>;
  importFromCsv(data: string): Promise<void>;
}
```

### Application in This Project

- Keep prop interfaces focused on component needs
- Split large hook returns into composable hooks
- Use pick/omit types when extending interfaces
- Repository interfaces should be role-specific

---

## D - Dependency Inversion Principle

> "Depend on abstractions, not concretions."

### Rule

High-level modules should not depend on low-level modules. Both should depend on **abstractions**.

### Examples

```typescript
// BAD: Component depends directly on concrete implementation
import { fetchUsers } from '../api/userApi';  // Concrete

function UserList() {
  useEffect(() => {
    fetchUsers().then(setUsers);  // Tightly coupled to API
  }, []);
}

// GOOD: Depend on abstraction (hook)
function UserList() {
  const { users } = useUsers();  // Abstraction
  return <List items={users} />;
}

// The hook can be implemented differently for testing
// features/users/application/hooks/useUsers.ts
export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: userApi.getAll });
}

// features/users/application/hooks/useUsers.mock.ts
export function useUsers() {
  return { users: mockUsers, isLoading: false };
}
```

```typescript
// BAD: Service depends on concrete implementations
class OrderService {
  async createOrder(data: CreateOrderDTO) {
    // Direct dependency on concrete API
    const response = await fetch("/api/orders", { body: data });

    // Direct dependency on concrete email service
    await sendEmail(response.user.email, "Order created");

    // Direct dependency on concrete analytics
    analytics.track("order_created", response);
  }
}

// GOOD: Depend on abstractions (interfaces)
interface IOrderRepository {
  create(data: CreateOrderDTO): Promise<Order>;
}

interface INotificationService {
  notify(userId: string, message: string): Promise<void>;
}

interface IAnalyticsService {
  track(event: string, data: unknown): void;
}

class OrderService {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly notifications: INotificationService,
    private readonly analytics: IAnalyticsService,
  ) {}

  async createOrder(data: CreateOrderDTO) {
    const order = await this.orderRepo.create(data);
    await this.notifications.notify(order.userId, "Order created");
    this.analytics.track("order_created", order);
    return order;
  }
}
```

### Application in This Project

| Instead of                         | Use                               |
| ---------------------------------- | --------------------------------- |
| Direct API calls in components     | Hooks that abstract data fetching |
| Concrete service classes           | Interfaces + implementations      |
| Hard-coded dependencies            | Dependency injection              |
| Direct localStorage/sessionStorage | Storage abstraction hooks         |

---

## Quick Reference

| Principle | Question to Ask                       |
| --------- | ------------------------------------- |
| **SRP**   | Does this do more than one thing?     |
| **OCP**   | Can I extend without modifying?       |
| **LSP**   | Can derived types replace base types? |
| **ISP**   | Am I forcing unused dependencies?     |
| **DIP**   | Am I depending on abstractions?       |

## Enforcement

When writing or reviewing code:

1. Check if components/hooks have single responsibility
2. Verify new features extend rather than modify
3. Ensure derived types honor base contracts
4. Keep interfaces small and focused
5. Inject dependencies rather than importing directly
