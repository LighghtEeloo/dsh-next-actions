# dsh-next-actions

English | [中文](README.zh.md)

> Suggested next actions under DeepSeek Harness replies — clicking one fills the input, never sends.

**Status: v0.1.5 (npm package: [dsh-next-actions](https://www.npmjs.com/package/dsh-next-actions)).**
See [`DESIGN.md`](DESIGN.md) for the design and rationale, and [`CHANGELOG.md`](CHANGELOG.md) for release notes.

## Install

Requires DSH 0.2.2-rc.1 or later, with a Host that supports the Web Client (Desktop and Web both work).

```sh
dsh plugin --profile desktop add dsh-next-actions
```

You can also install the same bundle with `plugin_manager`'s `install_bundle`, or by selecting it on the Plugins page in the Web sidebar.
Restart DSH after installing.

For local development, install this directory with `link:`:

```sh
dsh plugin --profile desktop add link:/path/to/dsh-next-actions
```

## Features

- One or two sentences of context plus up to 3 suggestion buttons; the card is stored with the session and survives refresh and replay.
- Button labels are shown in full and wrap when long; labels are capped at 80 display columns (CJK and fullwidth symbols count as 2, so roughly 80 Latin characters or 40 Chinese characters).
  Over the limit, the model is asked to shorten the label and call again; display never truncates.
- After the card is answered, it folds into a single row listing the suggestions that were used; clicking expands it, while the current card stays expanded.
  Folding and unfolding animate, including automatic folding.
- The recommended action is pinned first, with ✦ and a brand-colored outline.
  If the next message contains a whole line equal to a suggestion → check; if sent with edits → pencil (inferred from the session log, so typing similar text by hand is marked too).
- Clicking fills an empty draft, or inserts at the caret when the draft already has content (keeps `@` references, undoable with ⌘Z); it never sends.
- Risky suggestions carry a ⚠ mark and still only fill the input.
- One row in the tool process group; subagents do not register the tool; with `enabled: false` in the Host config, zero standing tokens.
- The card's own labels and status marks follow DSH's interface language: Chinese, English, Japanese, Spanish, French, German, Russian and Portuguese.
- Compatible with PTC (`run_code`) sessions.

## Layout

```text
index.js            Host: tool, root-agent standing prompt, enabled gate
lib/normalize.js    Argument normalization; writes the card model to tool/result.meta
client.js           Client (hand-written single file): definitions, card, process row and CSS
cordis.patch.yml    Plugin row patch
locale/             Plugin metadata (title and description) per DSH language
test/               node --test
assets/promo/       Promo video: sources, poster and render scripts (output is not committed or published to npm)
```

## Development

```sh
node --test         # tests
npm pack --dry-run  # packaging check
```

Use `plugin_manager`'s `install_bundle` / `remove_bundle` to install or uninstall; verify with a fake `DSH_HOME`.
Restart DSH for Host changes; refresh the page for Client changes.

## Release

After updating the version in `package.json` and `CHANGELOG.md`:

```sh
node --test
npm pack --dry-run
git tag -a v<version> -m "v<version>"
git push origin main --tags
npm publish --access public
npm view dsh-next-actions version   # confirm latest points at the new version
```

After publishing, install once from the registry with a fake `DSH_HOME`; local `link:` installs do not need switching.

To turn the feature off, add this to the profile's `cordis.patch.yml`:

```yaml
- id: dsh-next-actions
  name: 'dsh-next-actions'
  config: { enabled: false }
```

## License

MIT (see [LICENSE](LICENSE)).
The card appearance follows the MIT-licensed official DSH action cards; see [NOTICE](NOTICE) for attribution.
This is not an official DeepSeek plugin.
