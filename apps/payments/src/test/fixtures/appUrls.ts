/**
 * Mock appUrls for unit tests.
 * Use in vi.mock('@/shared/infrastructure/config', () => mockPaymentsConfig).
 */
const mockAppUrls = {
  landing: "http://localhost:5004",
  store: "http://localhost:5001",
  admin: "http://localhost:5002",
  payments: "http://localhost:5005",
  studio: "http://localhost:5006",
  auth: "http://localhost:5000",
} as const;

export const mockPaymentsConfig = {
  appUrls: mockAppUrls,
};
