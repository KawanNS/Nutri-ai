import { Fragment, type ReactNode } from 'react'

const inlineMarkdown = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g
const unorderedItem = /^\s*[-+*]\s+(.+)$/
const orderedItem = /^\s*\d+[.)]\s+(.+)$/
const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/
const divider = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(inlineMarkdown).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    return <Fragment key={key}>{part}</Fragment>
  })
}

export function MarkdownMessage({ content }: { content: string }) {
  const blocks: ReactNode[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  function flushParagraph() {
    if (paragraph.length === 0) return
    const blockIndex = blocks.length
    blocks.push(<p key={`paragraph-${blockIndex}`}>{paragraph.map((line, index) => (
      <Fragment key={`line-${blockIndex}-${index}`}>
        {index > 0 && <br />}
        {renderInline(line, `inline-${blockIndex}-${index}`)}
      </Fragment>
    ))}</p>)
    paragraph = []
  }

  function flushList() {
    if (!list) return
    const blockIndex = blocks.length
    const items = list.items.map((item, index) => (
      <li key={`item-${blockIndex}-${index}`}>{renderInline(item, `list-${blockIndex}-${index}`)}</li>
    ))
    blocks.push(list.ordered
      ? <ol key={`list-${blockIndex}`}>{items}</ol>
      : <ul key={`list-${blockIndex}`}>{items}</ul>)
    list = null
  }

  for (const line of content.replace(/\r\n?/g, '\n').split('\n')) {
    if (divider.test(line)) {
      flushParagraph()
      flushList()
      blocks.push(<hr key={`divider-${blocks.length}`} />)
      continue
    }
    const title = line.match(heading)
    if (title) {
      flushParagraph()
      flushList()
      const blockIndex = blocks.length
      const children = renderInline(title[2], `heading-${blockIndex}`)
      blocks.push(title[1].length <= 3
        ? <h3 key={`heading-${blockIndex}`}>{children}</h3>
        : <h4 key={`heading-${blockIndex}`}>{children}</h4>)
      continue
    }
    const unordered = line.match(unorderedItem)
    const ordered = line.match(orderedItem)
    if (unordered || ordered) {
      flushParagraph()
      const isOrdered = ordered !== null
      if (list && list.ordered !== isOrdered) flushList()
      list ??= { ordered: isOrdered, items: [] }
      list.items.push((ordered ?? unordered)![1])
      continue
    }
    if (line.trim() === '') {
      flushParagraph()
      flushList()
      continue
    }
    flushList()
    paragraph.push(line)
  }
  flushParagraph()
  flushList()

  return <div className="chat-markdown">{blocks}</div>
}
