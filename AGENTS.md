# Project instructions

## Attribution

When Codex contributes to changes and creates their commit, keep the repository owner's normal author/committer identity and add this exact trailer once at the end of the commit message, separated from the body by a blank line:

```text
Co-authored-by: Codex <noreply@openai.com>
```

Preserve other valid author trailers. Do not add Codex credit to work it did not contribute to. Do not rewrite published commits, release tags or assets solely to add attribution. The original app's GPT implementation and the human initiator's product role are documented in `docs/ATTRIBUTION.md`; third-party authorship and licenses remain distinct.

## Personal data

Follow `docs/REPOSITORY_POLICY.md`. Publish only reviewed source and documentation. Run `node tools/source-audit.mjs` before publishing. Keep real conversations, API credentials/configuration, runtime databases, logs, backups, papers and reading screenshots outside the source repository. Test with synthetic content and isolated profiles.
