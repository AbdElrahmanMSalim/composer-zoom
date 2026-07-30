# Publishing

Cursor's extension marketplace is [Open VSX](https://open-vsx.org), not the Microsoft VS Code Marketplace. Publishing to Microsoft's registry will not make this installable in Cursor.

## Before the first publish

Two fields in `package.json` are placeholders and must be corrected:

- `publisher` is set to `AbdelrahmanMSalim`, guessed from the local git config. It has to exactly match the Open VSX namespace you claim below.
- `repository.url` and `bugs.url` point at a GitHub repository that may not exist yet. Create it, or edit both fields.

The listing image is `media/icon.png` at 256×256, above the 128×128 minimum and sharp on high-density displays. Replace that file to change it, keeping it square.

## One-time account setup

1. Sign in to [open-vsx.org](https://open-vsx.org) with GitHub.
2. Create an Eclipse Foundation account and sign the Publisher Agreement. Use the same email as your GitHub account so the two link.
3. Generate an access token from your Open VSX profile page.
4. Claim your namespace, which must equal the `publisher` field:

```bash
npx ovsx create-namespace <publisher> -p <token>
```

Claiming the namespace is also what gets the listing marked as verified.

## Publishing a version

```bash
npm install
npm run test:runtime          # runtime behaviour under a stubbed DOM
npm run build                 # type-check and compile
npx @vscode/vsce package      # inspect what lands in the .vsix
npx ovsx publish composer-zoom-<version>.vsix -p <token>
```

Bump `version` in `package.json` and add a `CHANGELOG.md` entry first; Open VSX rejects republishing an existing version.

## Cursor-specific step

Cursor runs its own publisher verification on top of Open VSX before an extension becomes searchable inside the app. Until that clears, the listing exists on open-vsx.org and can be installed manually.

## Installing without the marketplace

Anyone can sideload the packaged file:

```bash
cursor --install-extension composer-zoom-<version>.vsix
```

Or through the UI: **Extensions: Install from VSIX...** in the Command Palette.

Note that sideloading does **not** pull in the `subframe7536.custom-ui-style` dependency automatically the way a marketplace install does. Install it first, or the extension will warn on activation and do nothing.
