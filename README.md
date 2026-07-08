# article

`<nostr-article>` — long-form content
([NIP-23](https://github.com/nostr-protocol/nips/blob/master/23.md), kind
30023) with a **safe, zero-dependency markdown renderer**. No build step. One
file: [`article.js`](article.js).

Part of [nostr-client](https://github.com/nostr-client) — a modular, composable
nostr client where each repo does one thing.

**Live demo:** https://nostr-client.github.io/article/ ·
**Read articles:** [reader](https://nostr-client.github.io/reader/)

## Use

```html
<script type="module" src="https://nostr-client.github.io/article/article.js"></script>
<nostr-article event-id="<hex>"></nostr-article>
```

```js
el.event = someKind30023Event   // render directly
```

Also exported:

```js
import { renderMarkdownInto, articleMeta } from 'https://nostr-client.github.io/article/article.js'
```

- `renderMarkdownInto(el, md)` — headings, paragraphs, bold/italic/inline
  code, links, images, blockquotes, fenced code, lists, hr. **Built from DOM
  nodes only — never `innerHTML`.** Raw HTML in the source renders as text,
  by design. Only http(s) URLs become links/images.
- `articleMeta(event)` — `{ title, summary, image, publishedAt, identifier, hashtags }`

## License

AGPL-3.0-or-later
