# Security policy

xyChat keeps people's private chats, so security and privacy reports are taken
seriously.

## Supported versions

Only the latest release receives fixes. The live app at
<https://hamza-kakar.github.io/xyChat/> always runs the latest release.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it
privately through GitHub instead:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Describe the problem, the steps to reproduce it, and its impact.

Never include real chat content, phone numbers or other personal data in a
report. If an example export is needed, make one up or anonymize a real one
first (`pnpm anonymize <export> <out-dir>`).

You can expect a first reply within a week. Once a fix is released, the report
can be published with credit to you, if you'd like.

## What counts as a security issue

Examples of what we want to hear about:

- Any way for chat content, media or metadata to leave the device.
- Script injection through an imported export (message text, file names,
  contact cards, links).
- Bypassing the Content Security Policy.
- Bypassing the app lock in a way that exposes chat content.
- Crashes or data loss caused by a crafted export file.

Known design limits that are **not** vulnerabilities:

- The PIN is a privacy screen, not encryption. Anyone with access to the
  device's storage can read the data, as documented in the README.
- Backup files are not encrypted.
