## 3. Keep two evidence layers and one Pixso output

1. The browser-computed manifest plus `html-reference.png` prove current HTML
   geometry, final computed style, child order, assets and visible appearance.
2. `Structured Output / <runId>` is the only Pixso output. It is produced from
   the Operation Plan and must use Variables, Styles, Auto Layout and verified
   Component Instances.

Do not publish the structured board until its screenshot matches the HTML
reference within tolerance and its readback proves component and Variable parity.

If a normal run fails for unexplained geometry or rendering reasons, stop it and
create a new `--mode diagnostic` run. That run may create one native
code-to-design baseline, must record the exact node id, and must remove only that
node after diagnosis. Diagnostic artifacts never become canonical inputs.

When the diagnostic cause is an image API incompatibility, reproduce it with a
minimal image fixture first, fix the shared runtime/compiler, end the diagnostic
run, and start a fresh normal run. Never let an image-only exception trigger a
full-page rollback before the structural import has completed.

