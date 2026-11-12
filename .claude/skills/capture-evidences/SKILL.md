---
name: capture-evidences
description: Capture screenshots of implemented features and post them as evidence to a GitHub issue. Uses Playwright MCP for screenshots and GitHub draft releases for image hosting.
---

# Capture Evidences

## Description

Captures visual evidence (screenshots) of completed work and posts them to the corresponding GitHub issue. This documents what was built, serves as proof of implementation, and provides visual context for code reviewers.

---

## Usage

```
/capture-evidences [issue-number] [options]
```

Or natural language:

```
Capture evidences for issue 162
Take screenshots and post to the GitHub issue
Document the work with screenshots on the issue
```

## Parameters

| Parameter      | Required | Description                                                 |
| -------------- | -------- | ----------------------------------------------------------- |
| `issue-number` | No       | GitHub issue number (auto-detected from branch if omitted)  |
| `--app`        | No       | App to screenshot (default: `web`, options: `web`, `admin`) |
| `--locale`     | No       | Also capture in alternate locale (e.g., `es`)               |
| `--port`       | No       | Dev server port (default: `3000`)                           |

---

## Prerequisites

Before running this skill:

- [ ] Dev server is running (`pnpm dev`)
- [ ] Feature is implemented and working
- [ ] Browser MCP is available (Playwright or Chrome DevTools)

---

## Workflow

### Phase 1: Preparation

1. **Detect issue number** from current branch name (e.g., `feat/GH-162_Title` -> `162`)
2. **Verify dev server** is accessible at `localhost:{port}`
3. **Create output directory** at `.ai-context/task-outputs/GH-{number}/images/`

### Phase 2: Screenshot Capture

For each feature/functionality implemented:

1. **Navigate** to the relevant page using Playwright MCP
2. **Interact** with the feature to show it working (click buttons, open dropdowns, hover elements, etc.)
3. **Take screenshot** with a descriptive filename
4. **Repeat** for each distinct feature or state

#### Screenshot Checklist

- [ ] Capture the **default/resting state** of the feature
- [ ] Capture **interactive states** (hover, open, expanded)
- [ ] Capture **detail views** (modals, expanded panels, full content)
- [ ] Capture **alternate locale** (if i18n is implemented)
- [ ] Capture **responsive views** if relevant (mobile, tablet)
- [ ] Capture **dark mode** if relevant

#### Naming Convention

```
{NN}-{description}.png
```

Examples:

- `01-toast-notifications-overlay.png`
- `02-notification-center-dropdown.png`
- `03-notification-details-modal.png`
- `04-spanish-locale-notifications.png`
- `05-mobile-responsive-view.png`

### Phase 3: Upload Images to GitHub

GitHub's issue comment API does not support direct image uploads via token auth. Use this workaround:

#### Step 1: Create a Draft Release

```bash
gh release create temp-gh-{number}-images \
  --draft \
  --title "Evidence images for GH-{number}" \
  --notes "Temporary draft release for hosting evidence images. Safe to delete after images are referenced in the issue."
```

#### Step 2: Upload Images as Release Assets

```bash
gh release upload temp-gh-{number}-images \
  .ai-context/task-outputs/GH-{number}/images/01-screenshot.png \
  .ai-context/task-outputs/GH-{number}/images/02-screenshot.png \
  # ... all images
```

#### Step 3: Get CDN URLs

```bash
gh release view temp-gh-{number}-images --json assets --jq '.assets[] | "\(.name) \(.url)"'
```

The asset URLs follow this pattern:

```
https://github.com/{owner}/{repo}/releases/download/temp-gh-{number}-images/{filename}
```

### Phase 4: Post to GitHub Issue

Create a comment on the issue with embedded images:

```bash
gh issue comment {number} --body "$(cat <<'EOF'
## Evidence Screenshots

### 1. Feature Name
![Description](https://github.com/{owner}/{repo}/releases/download/temp-gh-{number}-images/01-screenshot.png)
Brief description of what this screenshot shows.

### 2. Next Feature
![Description](https://github.com/{owner}/{repo}/releases/download/temp-gh-{number}-images/02-screenshot.png)
Brief description.

---
*Screenshots captured from `localhost:{port}` with simulation/mock mode enabled.*
EOF
)"
```

---

## Checklist

Use this checklist when running the skill:

### Preparation

- [ ] Dev server is running and accessible
- [ ] Feature is fully implemented and working
- [ ] Current branch matches the target issue

### Screenshot Capture

- [ ] All implemented features have at least one screenshot
- [ ] Interactive elements shown in their activated states
- [ ] Detail views (modals, panels) captured open
- [ ] i18n alternate locale captured (if applicable)
- [ ] Screenshots saved to `.ai-context/task-outputs/GH-{number}/images/`
- [ ] Files named with `{NN}-{description}.png` pattern

### Upload & Post

- [ ] Draft release created: `temp-gh-{number}-images`
- [ ] All images uploaded as release assets
- [ ] CDN URLs verified (accessible without auth)
- [ ] GitHub issue comment posted with embedded images
- [ ] Each image has a heading and brief description
- [ ] Comment renders correctly (check on GitHub)

### Cleanup (Optional - After PR Merge)

- [ ] Draft release deleted: `gh release delete temp-gh-{number}-images --yes`

---

## Screenshot Tips

### Capturing Interactive States

Use Playwright MCP to interact before taking screenshots:

```
# Navigate to page
mcp__playwright__browser_navigate({ url: "http://localhost:3000/en/dashboard" })

# Interact with elements (hover, click)
mcp__playwright__browser_hover({ ref: "element-ref", element: "notification bell" })
mcp__playwright__browser_click({ ref: "element-ref", element: "dropdown trigger" })

# Wait for animations
mcp__playwright__browser_wait_for({ time: 1 })

# Take screenshot
mcp__playwright__browser_take_screenshot({ type: "png", filename: "01-feature.png" })
```

### Capturing Full Page vs Viewport

```
# Viewport only (default) - for specific UI elements
mcp__playwright__browser_take_screenshot({ type: "png" })

# Full page - for long scrollable content
mcp__playwright__browser_take_screenshot({ type: "png", fullPage: true })

# Specific element - for isolated components
mcp__playwright__browser_take_screenshot({ type: "png", ref: "element-ref", element: "component name" })
```

### Resizing for Responsive

```
# Mobile
mcp__playwright__browser_resize({ width: 375, height: 812 })

# Tablet
mcp__playwright__browser_resize({ width: 768, height: 1024 })

# Desktop (reset)
mcp__playwright__browser_resize({ width: 1440, height: 900 })
```

---

## Why Draft Releases?

GitHub's API does not support uploading images directly to issue comments using personal access tokens. The standard flow (used by the web UI) requires session-based authentication with CSRF tokens.

**Draft releases solve this because:**

- `gh release upload` supports binary file uploads via CLI
- Release assets get permanent CDN URLs that work in markdown
- Draft releases are invisible to users (not published)
- Easy cleanup: `gh release delete <tag> --yes`

**Alternative approaches that do NOT work:**

- `gh issue comment` with base64-encoded images (not supported)
- GitHub API multipart upload to issue comments (requires browser session)
- `gh` CLI image attachment (not a supported feature)

---

## Examples

### Example 1: Basic Evidence Capture

```
/capture-evidences 162
```

Captures screenshots of all features for issue #162 and posts them as a comment.

### Example 2: With Locale

```
/capture-evidences 162 --locale es
```

Also captures screenshots in Spanish locale.

### Example 3: Natural Language

```
Take screenshots of the notification system and post them to issue 162
```

---

## Error Handling

### Dev Server Not Running

```
Error: Could not connect to localhost:3000

Fix: Start the dev server first:
  pnpm dev
```

### Draft Release Already Exists

```
Error: Release 'temp-gh-162-images' already exists

Fix: Delete and recreate:
  gh release delete temp-gh-162-images --yes
  gh release create temp-gh-162-images --draft --title "Evidence images for GH-162"
```

### Upload Failed

```
Error: Failed to upload asset

Fix: Check file exists and is not too large (GitHub limit: 2GB per asset)
  ls -la .ai-context/task-outputs/GH-162/images/
```

---

## Related Skills

| Skill          | Purpose                            | When to Use                |
| -------------- | ---------------------------------- | -------------------------- |
| `/start-task`  | Initialize task with branch + docs | Before implementation      |
| `/e2e-eval`    | Run automated E2E tests            | Before capturing evidences |
| `/submit-pr`   | Create pull request                | After capturing evidences  |
| `/code-review` | Review code quality                | Before or after evidences  |

---

## Related Rules

- [Git Safety](../../../docs/lessons/git-safety.md) - No auto-commits
- [E2E Selectors](../../rules/e2e-selectors.md) - Stable element selectors
- [Testing](../../rules/testing.md) - Testing standards
