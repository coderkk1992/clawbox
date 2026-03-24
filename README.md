# ClawBox

A desktop app for [OpenClaw](https://github.com/openclaw/openclaw) that runs in an isolated Linux virtual machine.

## Why ClawBox?

OpenClaw is a powerful personal AI assistant, but it has two adoption barriers:

1. **CLI-only** - Many users aren't comfortable with command-line interfaces
2. **Full system access** - Runs directly on your machine with access to all your files

ClawBox solves both:

- **Beautiful desktop GUI** - Native macOS app experience
- **VM isolation** - OpenClaw runs in a sandboxed Linux environment, protecting your system

## Features

- One-click setup wizard
- Resource allocation controls (RAM, CPU)
- Built-in chat interface
- Image paste and drag-drop file uploads
- Multi-channel messaging (Telegram, Discord, Slack, and more)
- Agent personality customization
- System tray integration

## Requirements

- **macOS 13.0** (Ventura) or later
- **4GB+ RAM** recommended
- **10GB disk space** for the VM
- Apple Silicon: Rosetta 2 (macOS prompts automatically if needed)

No Homebrew or developer tools required.

## Installation

### From Release

Download the latest `.dmg` from [Releases](https://github.com/clawbox/clawbox/releases):

- `ClawBox_x.x.x_aarch64.dmg` - Apple Silicon (M1/M2/M3)
- `ClawBox_x.x.x_x64.dmg` - Intel

### From Source

```bash
# Prerequisites: Node.js 22+, Rust, pnpm

git clone https://github.com/clawbox/clawbox.git
cd clawbox
pnpm install
pnpm tauri build
```

## Development

```bash
pnpm install
pnpm tauri dev
```

## Architecture

```
┌─────────────────────────────────────────┐
│           ClawBox Desktop App           │
│              (Tauri + React)            │
├─────────────────────────────────────────┤
│            VM Manager (Lima)            │
├─────────────────────────────────────────┤
│         Linux VM (Ubuntu 24.04)         │
│  ┌─────────────────────────────────┐    │
│  │    OpenClaw Gateway + Agent     │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

## License

[MIT](LICENSE)

## Credits

- [OpenClaw](https://github.com/openclaw/openclaw) - The AI assistant
- [Tauri](https://tauri.app) - Desktop app framework
- [Lima](https://github.com/lima-vm/lima) - Linux VM for macOS
