# Contributing to ClawBox

Thanks for your interest in contributing to ClawBox!

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/clawbox.git
   cd clawbox
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Run in development mode:
   ```bash
   pnpm tauri dev
   ```

## Development Setup

### Prerequisites

- **Node.js 22+**
- **Rust** (via [rustup](https://rustup.rs))
- **pnpm** (`npm install -g pnpm`)
- **macOS 13+** (Ventura or later)

### Project Structure

```
clawbox/
├── src/                  # React frontend
│   ├── pages/            # Page components
│   ├── App.tsx           # Main app component
│   └── App.css           # Styles
├── src-tauri/            # Rust backend
│   ├── src/
│   │   ├── commands.rs   # Tauri commands
│   │   ├── vm/           # VM management (Lima)
│   │   └── lib.rs        # App setup
│   └── Cargo.toml
└── package.json
```

## Making Changes

1. Create a branch for your feature:
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes

3. Test thoroughly:
   - Run `pnpm tauri dev` and test the feature
   - Ensure the app builds: `pnpm tauri build`

4. Commit with a clear message:
   ```bash
   git commit -m "Add feature: description"
   ```

5. Push and open a Pull Request

## Code Style

- **TypeScript/React**: Use functional components and hooks
- **Rust**: Follow standard Rust conventions, run `cargo fmt`
- **CSS**: Use CSS variables defined in `App.css`

## Reporting Issues

When reporting bugs, please include:

- macOS version
- Apple Silicon or Intel
- Steps to reproduce
- Error messages (check Console.app for logs)

## Questions?

Open an issue for discussion or questions about the codebase.
