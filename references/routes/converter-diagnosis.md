# Converter diagnosis route

Read `references/pixso-import-details.md` and
`references/pixso-execution-invariants.md` for mapping and executor rules.

Use after a normal import stops at a named gate. Diagnosis is a separate run and
cannot publish into the failed normal run.

Read, in this order and only as needed:

1. `references/pixso-fidelity-import-pipeline.md` for lifecycle and evidence.
2. `references/pixso-native-scene.md` only for compiler/runtime structure.
3. `references/pixso-mcp.md` only when the plugin cannot execute or current-file
   API behavior must be inspected.
4. `references/pixso-visual-parity.md` only for screenshot calibration/diff.

Identify one failing stage, reproduce it with a minimal fixture, fix the shared
collector/compiler/runtime, add a cross-page regression, and end the diagnostic
run. Start a new normal run for acceptance. `code_to_design` is allowed only as
temporary visual evidence in this diagnostic route.
