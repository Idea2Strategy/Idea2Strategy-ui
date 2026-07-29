# Strategy editor UI principles

This guide records the recurring product and implementation preferences established while refining the Basic strategy editor. Apply it to both Basic and Pro unless a product specification explicitly requires otherwise.

## 1. Reduce interpretation before adding decoration

- Show only information needed for the next decision.
- Remove repeated labels, counts, status text, helper copy, and technical type names.
- Prefer short labels, icons, tags, and progressive disclosure over explanatory paragraphs.
- Do not expose internal terms such as `Null`, `Boolean`, `Float`, or engine-only state.
- A control must keep the same footprint when its value changes.

## 2. Never choose a material strategy value for the user

- Every editable value that can affect a strategy starts unset.
- Use neutral placeholders such as `선택` and `입력`; never render `(Null)`.
- Examples and templates may place and connect structure, but must not silently fill investment thresholds, periods, symbols, allocation, or order values.
- An incomplete strategy can be saved, but release remains disabled until blocking issues are resolved.

## 3. Make structure visible

- Basic containers must feel like a single AND rule group, not unrelated cards with large gaps.
- Pro must read left to right and visually separate execution flow from typed data flow.
- Ports sit on the same row as the setting or value they affect.
- Connections and categories must be recognizable by shape or text in addition to color.
- Empty states should occupy approximately the space of a real item and should not duplicate another add control.

## 4. Preserve spatial freedom without creating collisions

- Containers and nodes can be freely positioned within their canvas.
- Dragging must not allow content to hide beneath fixed headers or leave the usable canvas.
- Drops should honor the pointer position, including insertion after the final item.
- Nearby items should not overlap after placement; resolve collisions predictably.
- Side panels slide toward their own edge when collapsed and leave the reopen handle visible.

## 5. Keep interaction language and geometry consistent

- Controls with the same purpose use the same height, typography, spacing, and interaction pattern.
- Operator controls such as direction and comparison are visually distinct from value dropdowns.
- Dropdown menus scroll independently and must not trigger canvas zoom.
- Number inputs hide browser-native stepper arrows; custom increment controls remain centered and stable.
- Use direct language such as `드래그로 이동`.

## 6. Use color as a restrained semantic layer

- Do not fill every library item or control with a saturated category color.
- Prefer a broad edge band, top rule, icon background, or subtle tint.
- Related categories share a color family; unrelated items remain visually calm.
- Interactive controls inside colored blocks retain a readable tint derived from that block in both themes.
- Status colors must match their meaning and include a non-color cue.

## 7. Put editing where users look

- Frequently changed values belong directly in the block or node.
- Names are edited beside the name, with a pencil action revealed on hover or focus.
- Side inspectors contain advanced settings, validation, port help, and longer explanations—not duplicate primary controls.
- Editing must not make a card unexpectedly grow far beyond its normal footprint; use compact panels, tabs, popovers, or scroll regions.

## 8. Validate in context

- Validation describes the problem, its impact, and the action required.
- Selecting a validation issue moves focus to the exact container, node, port, or setting.
- Warnings do not masquerade as successful execution.
- A preview must not overlap the editor or sidebars and must clearly distinguish requests/signals from actual fills.

## 9. Accessibility and regression expectations

- Every icon-only action has an accessible name.
- Keyboard users can select, edit, connect, delete, undo, and redo essential graph operations.
- Focus indicators remain visible in both themes.
- Color is never the only carrier of type, direction, warning, or status.
- Changes to Pro must not regress Basic layout, drag/drop, dropdown scrolling, theme behavior, or launch validation.

## 10. Review checklist

Before handoff, review separately for:

1. Functional correctness: add, move, connect, disconnect, edit, save, validate, undo, redo.
2. Visual coherence: density, alignment, overlap, clipping, theme contrast, panel spacing.
3. Safety and regression: unset defaults, release blocking, keyboard/accessibility, Basic editor tests.
