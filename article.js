/**
 * article.js — <nostr-article>, long-form content (NIP-23, kind 30023),
 * with a safe minimal markdown renderer. No build step, zero dependencies.
 *
 * Part of https://github.com/nostr-client — one repo, one thing.
 * License: AGPL-3.0-or-later
 *
 * Usage:
 *   <script type="module" src="https://nostr-client.github.io/article/article.js"></script>
 *   <nostr-article event-id="<hex>"></nostr-article>
 *   el.event = <kind 30023 event>
 *
 * The markdown subset is rendered with DOM nodes only (never innerHTML):
 * headings, paragraphs, bold/italic/inline code, links, images, blockquotes,
 * fenced code blocks, unordered/ordered lists, hr. Raw HTML in the source is
 * shown as text — by design.
 */

import { defaultPool } from 'https://nostr-client.github.io/pool/pool.js'
import { profiles, formatAgo } from 'https://nostr-client.github.io/note/note.js'
import { npubShort } from 'https://nostr-client.github.io/nip19/nip19.js'

const HEX64 = /^[0-9a-f]{64}$/

const safeUrl = (url) => {
  try {
    const u = new URL(url)
    return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : null
  } catch { return null }
}

// ------------------------------------------------ inline markdown → nodes

function renderInline(el, text) {
  // tokens: ![alt](url) | [text](url) | `code` | **bold** | *italic* | autolink
  const re = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|(https?:\/\/[^\s<>"')\]]+)/g
  let last = 0
  for (const m of text.matchAll(re)) {
    el.append(text.slice(last, m.index))
    last = m.index + m[0].length
    const [, imgAlt, imgUrl, aText, aUrl, code, bold, italic, auto] = m
    if (imgUrl !== undefined) {
      const url = safeUrl(imgUrl)?.startsWith('https://') ? safeUrl(imgUrl) : null
      if (url) {
        const img = document.createElement('img')
        img.src = url
        img.alt = imgAlt
        img.loading = 'lazy'
        el.append(img)
      } else el.append(m[0])
    } else if (aUrl !== undefined) {
      const url = safeUrl(aUrl)
      if (url) {
        const a = document.createElement('a')
        a.href = url
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        renderInline(a, aText)
        el.append(a)
      } else el.append(m[0])
    } else if (code !== undefined) {
      const c = document.createElement('code')
      c.textContent = code
      el.append(c)
    } else if (bold !== undefined) {
      const b = document.createElement('strong')
      renderInline(b, bold)
      el.append(b)
    } else if (italic !== undefined) {
      const i = document.createElement('em')
      renderInline(i, italic)
      el.append(i)
    } else if (auto !== undefined) {
      const url = safeUrl(auto)
      if (url) {
        const a = document.createElement('a')
        a.href = url
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.textContent = auto.length > 60 ? auto.slice(0, 60) + '…' : auto
        el.append(a)
      } else el.append(auto)
    }
  }
  el.append(text.slice(last))
}

// ------------------------------------------------- block markdown → nodes

/** Render a safe markdown subset into `el` using only DOM APIs. */
export function renderMarkdownInto(el, md) {
  const lines = String(md).replaceAll('\r\n', '\n').split('\n')
  let i = 0
  let paragraph = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    const p = document.createElement('p')
    renderInline(p, paragraph.join(' '))
    el.append(p)
    paragraph = []
  }

  while (i < lines.length) {
    const line = lines[i]

    if (/^\s*$/.test(line)) { flushParagraph(); i++; continue }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      const h = document.createElement('h' + heading[1].length)
      renderInline(h, heading[2])
      el.append(h)
      i++; continue
    }

    if (/^(---+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph()
      el.append(document.createElement('hr'))
      i++; continue
    }

    if (/^```/.test(line)) {
      flushParagraph()
      const buf = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++])
      i++ // closing fence
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.textContent = buf.join('\n')
      pre.append(code)
      el.append(pre)
      continue
    }

    if (/^>\s?/.test(line)) {
      flushParagraph()
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''))
      const bq = document.createElement('blockquote')
      renderMarkdownInto(bq, buf.join('\n'))
      el.append(bq)
      continue
    }

    const listMatch = /^(\s*)([-*]|\d+\.)\s+/.exec(line)
    if (listMatch) {
      flushParagraph()
      const ordered = /\d/.test(listMatch[2])
      const list = document.createElement(ordered ? 'ol' : 'ul')
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i])
        if (!m) break
        const li = document.createElement('li')
        renderInline(li, m[3])
        list.append(li)
        i++
      }
      el.append(list)
      continue
    }

    paragraph.push(line.trim())
    i++
  }
  flushParagraph()
}

/** Pull NIP-23 metadata out of a kind-30023 event's tags. */
export function articleMeta(event) {
  const tag = (name) => event.tags.find((t) => t[0] === name)?.[1]
  return {
    title: tag('title') || '(untitled)',
    summary: tag('summary') || '',
    image: (safeUrl(tag('image') || '') || '').startsWith('https://') ? safeUrl(tag('image')) : null,
    publishedAt: Number(tag('published_at')) || event.created_at,
    identifier: tag('d') || '',
    hashtags: event.tags.filter((t) => t[0] === 't').map((t) => t[1]),
  }
}

// ---------------------------------------------------------------- element

const TEMPLATE = /* html */ `
<style>
  :host { display: block;
    font-family: var(--nc-font-content, var(--nc-font, ui-sans-serif, system-ui, sans-serif));
    color: var(--nc-ink, #201d26); line-height: 1.7; font-size: 1.05rem; }
  .head { font-family: var(--nc-font, ui-sans-serif, system-ui, sans-serif); }
  .cover { width: 100%; max-height: 20rem; object-fit: cover; border-radius: var(--nc-radius, 14px);
    border: 1px solid var(--nc-line, #e9e6e0); }
  h1.title { font-size: 2rem; line-height: 1.2; letter-spacing: -0.015em; margin: 1rem 0 .4rem; }
  .byline { font-size: .85rem; color: var(--nc-soft, #6d6a76); margin-bottom: 1.6rem; }
  .byline .name { font-weight: 650; color: var(--nc-ink, #201d26); }
  .body h1, .body h2, .body h3 { font-family: var(--nc-font, ui-sans-serif, system-ui, sans-serif);
    line-height: 1.25; margin: 1.6em 0 .5em; }
  .body p { margin: .9em 0; }
  .body img { max-width: 100%; border-radius: 10px; border: 1px solid var(--nc-line, #e9e6e0); }
  .body a { color: var(--nc-accent, #7c3aed); }
  .body code { font-family: var(--nc-mono, ui-monospace, monospace); font-size: .88em;
    background: var(--nc-inset, #f4f2ee); border: 1px solid var(--nc-line, #e9e6e0);
    border-radius: 5px; padding: .1em .35em; }
  .body pre { background: var(--nc-inset, #f4f2ee); border: 1px solid var(--nc-line, #e9e6e0);
    border-radius: 10px; padding: 1em 1.1em; overflow-x: auto; line-height: 1.5; }
  .body pre code { background: none; border: none; padding: 0; }
  .body blockquote { border-left: 3px solid var(--nc-accent, #7c3aed); margin: 1em 0;
    padding: .1em 0 .1em 1.1em; color: var(--nc-soft, #6d6a76); }
  .missing { padding: 1rem; border: 1px dashed var(--nc-line, #e9e6e0);
    border-radius: var(--nc-radius, 14px); color: var(--nc-faint, #a8a4b0); font-size: .9rem; }
</style>
<div id="root"></div>
`

class NostrArticle extends HTMLElement {
  static observedAttributes = ['event-id']

  constructor() {
    super()
    this.attachShadow({ mode: 'open' }).innerHTML = TEMPLATE
    this.root = this.shadowRoot.getElementById('root')
    this.pool = null
    this._event = null
    this._seq = 0
  }

  get event() { return this._event }
  set event(ev) { this._event = ev; if (this.isConnected) this._render() }

  connectedCallback() {
    if (this._event) this._render()
    else if (this.getAttribute('event-id')) this._fetch()
  }

  attributeChangedCallback(_n, o, n) { if (o !== n && this.isConnected && n) this._fetch() }

  async _fetch() {
    const id = (this.getAttribute('event-id') || '').toLowerCase()
    if (!HEX64.test(id)) return
    const seq = ++this._seq
    this.root.innerHTML = '<div class="missing">loading article…</div>'
    const event = await (this.pool ?? defaultPool()).get({ ids: [id] })
    if (seq !== this._seq) return
    if (!event) { this.root.innerHTML = '<div class="missing">article not found on connected relays</div>'; return }
    this._event = event
    this._render()
  }

  _render() {
    const event = this._event
    const meta = articleMeta(event)
    this.root.innerHTML = ''

    const head = document.createElement('div')
    head.className = 'head'
    if (meta.image) {
      const cover = document.createElement('img')
      cover.className = 'cover'
      cover.src = meta.image
      cover.alt = ''
      head.append(cover)
    }
    const title = document.createElement('h1')
    title.className = 'title'
    title.textContent = meta.title
    const byline = document.createElement('div')
    byline.className = 'byline'
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = npubShort(event.pubkey)
    byline.append(name, ` · ${new Date(meta.publishedAt * 1000).toLocaleDateString()} · ${formatAgo(event.created_at)} ago`)
    head.append(title, byline)

    const body = document.createElement('div')
    body.className = 'body'
    renderMarkdownInto(body, event.content)

    this.root.append(head, body)

    profiles(this.pool ?? defaultPool()).get(event.pubkey, (profile) => {
      const display = profile?.display_name || profile?.name
      if (display && this._event === event) name.textContent = display
    })
  }
}

if (!customElements.get('nostr-article')) customElements.define('nostr-article', NostrArticle)
