# Component library authoring

## Why JSON and HTML are split

Use JSON for decisions and HTML for structure:

- JSON is easy to inspect, validate and expose to an Agent as a legal candidate set.
- HTML keeps the actual nesting visible and avoids inventing a JSON-based DOM language.
- Source text is never embedded in either asset; the renderer binds it automatically.

## Theme package

```text
.themes/<theme-id>/
├── theme.json
└── components/
    └── <component-id>/
        ├── component.json
        └── template.html
```

`theme.json` must define:

- design tokens;
- `dense`, `balanced`, and `airy` rhythm scales;
- semantic relation to rhythm-token mapping;
- strong-emphasis and surface budgets;
- explicit component definition paths.

The rhythm values must stay ordered within each mode:

```text
close < flow < break < turn < section < release
```

## Component definition

A component declares its accepted Block types, automatic slots and variants. Narrow variants use optional `accepts` rules; a fallback variant provides safe coverage.

```json
{
  "specVersion": "1.0",
  "id": "prose",
  "kind": "prose",
  "accepts": { "blockTypes": ["lead", "paragraph", "quote"] },
  "slots": [{ "name": "content", "source": "content", "required": true }],
  "fallbackVariant": "body",
  "template": "template.html",
  "baseStyles": {
    "root": { "margin": "0" },
    "content": { "color": "{color.ink}", "line-height": "{lineHeight.body}" }
  },
  "variants": [
    {
      "id": "body",
      "label": "正文流",
      "priority": 10,
      "visualWeight": "quiet",
      "surface": "open",
      "emphasisCost": 0,
      "styles": {}
    }
  ]
}
```

Each component's declared fallback variant becomes the deterministic baseline. The Agent may sparsely select another legal candidate by supplying a reason; candidate priority never turns every reading gesture into a decoration.

## Template rules

```html
<section data-component-root data-style-role="root">
  <p data-style-role="content"><slot name="content"></slot></p>
</section>
```

- Declare exactly one `data-component-root`.
- Use only slots declared in `component.json`; list templates may render `items` in mutually exclusive `ul` and `ol` containers.
- Put styling in JSON style roles, never in the HTML template.
- Do not add class, ID, script, stylesheet, event handler or external dependency.
- Keep the component root's external margin at zero.

## Structured slots

The renderer, not the Agent, fills structural slots:

| Slot | Source | Requirement |
| --- | --- | --- |
| `content` | `Block.content` | required plain text |
| `content` | `heading.structure.title`, falling back to heading content | required for headings |
| `marker` | `heading.structure.marker/ordinal` | optional; may format a declared ordinal |
| `items` | `list.structure.items` | required for `list` |
| `content` | `quote.structure.content` | required for `quote` |
| `attribution` | `quote.structure.attribution` | optional for `quote` |
| `headers` | `table.structure.headers` | required for structured tables |
| `rows` | `table.structure.rows` | required for structured tables |
| `eyebrow` | `cta.structure.eyebrow` | optional for CTA |
| `prompt` | `cta.structure.prompt` | required for CTA |
| `highlight` | `cta.structure.highlight` | optional for CTA |

Use `data-slot-optional="attribution"` on the direct wrapper of an optional slot. The renderer removes the wrapper when no attribution exists. A component that requires unavailable structure is excluded from the candidate list, so the explicit prose fallback remains available.

## Reading-first acceptance checklist

Before registering a new component, verify it on complete articles rather than isolated samples:

1. Ordinary prose remains visually open; most paragraphs should not gain a surface.
2. Same-group blocks feel closer than continuations.
3. New arguments, pivots, sections and endings create progressively larger pauses.
4. Two strong components never become adjacent.
5. The 375px preview shows role, gesture, component, rhythm and reason clearly.
6. The WeChat fragment retains source text and contains only inline styling.

Add specialized primitives only when the semantic structure needs a distinct reading behavior. A new visual appearance alone is not enough reason to add a component.

## TUO theme packages

The active `tuo-*` packages keep their source-specific masthead, section, list, quote and CTA treatments inside their own component folders. Decorations use safe template nodes rather than pseudo-elements, while all source text remains renderer-owned.
