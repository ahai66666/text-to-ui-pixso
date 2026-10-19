## Target page and path preflight (failure-derived)

Treat the destination as an explicit identity, not as whatever Pixso currently
has selected. Keep these values separate in the task record:

- `browserHtmlPath`: the browser-checked source artifact;
- `pixsoImportHtmlPath` and any ZIP/HTML entry: the Pixso-specific import copy;
- `libraryPageName`/`libraryPageId`: normally `NewComponents` for strict reuse;
- `targetPageName`/`targetPageId`: the product page that owns the final Pattern;
- `targetFrameScope` and the freshly read `sourceFrameId`/component GUIDs.

An absolute file path is not a Pixso page ID. Do not derive a page from a
current selection, a same-name Frame, an old screenshot, an import archive, or
a cached GUID. Before every write, call `fetch_context` and enumerate pages with
`get_top_level_frames({"type":"page"})`; compare the active page ID and name
with the recorded phase target. Normalize only harmless case/whitespace; do
not accept a near match or an ambiguous duplicate.

Strict reuse has two explicit phases:

1. Focus `NewComponents`, verify the active page, and resolve/read back each
   source component, its containing page, variant, slots, SVGs, and Tokens.
2. Re-read the active page after the library phase, focus the recorded product
   page, re-enumerate pages, and only then create linked instances or page-owned
   content there.

If any page ID/name, frame scope, or source GUID is missing, stale, foreign, or
unexpected—or if the MCP cannot switch/focus pages—stop all writes, including
`code_to_design`, `apply_design`, bindings, replacement, and deletion. Preserve
the prepared HTML/import artifacts and ask the user to focus the exact target
page, using a fixed confirmation such as `已切换 Coremail`. Treat that reply as
a request to re-check, not as proof. If three consecutive checks still show the
same page, mark the Pixso stage blocked and report that no Pixso write occurred;
do not keep polling or create a replacement Frame on the wrong page.

