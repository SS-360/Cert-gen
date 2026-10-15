# Contributing to CertGen

CertGen is a local-first certificate studio. Contributions must preserve the user's control of their files and the accuracy of exported certificates.

## Repository rules

- Create a short-lived branch and submit a pull request to `master`; do not push directly to the default branch.
- The `verify` GitHub Actions check must pass before merging. Keep the branch up to date and resolve review conversations.
- Force-pushing or deleting `master` is prohibited.
- Review approval is not mandatory for a solo maintainer, but changes must still use the pull-request and CI workflow.
- Use descriptive commit messages and keep changes scoped. Explain user-visible changes and verification in the pull request.

## Privacy and security

- Use fictional placeholder data in code, tests, documentation, and screenshots.
- Never commit recipient lists, certificates, private templates, credentials, `.env` files, or `.vercel` state.
- Do not add file uploads, analytics, remote fonts, or third-party runtime services without an explicit product/privacy decision.
- Explicit template saves belong in browser-local storage. Do not silently persist recipient data.
- Treat imported PDFs, spreadsheets, font files, and layout JSON as untrusted input. Preserve validation and output escaping.
- Do not publish secrets or private documents in issues. Report security-sensitive details privately to the maintainer first.

## Development checks

Use Node.js 24.x:

```sh
npm ci
npm run dev
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

For rendering changes, verify a desktop viewport and a mobile viewport. Check that design and export retain the same text geometry, font metrics, and auto-fit behaviour. Add a regression test for the behaviour you change.

## Release conventions

- Use semantic version tags such as `v2.0.1` for intentional releases; do not create a tag for every commit.
- Tags identify reviewed commits on `master`. Do not move a published release tag; publish a new version instead.
- A Git tag does not itself publish the website. Verify the intended Vercel project and deployment before promoting a release.
- Preserve third-party font and dependency licence notices.
