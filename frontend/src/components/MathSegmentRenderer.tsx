import katex from 'katex'
import 'katex/dist/katex.min.css'

type MathSegmentRendererProps = {
  value: string
  display?: boolean
}

export default function MathSegmentRenderer({ value, display = false }: MathSegmentRendererProps) {
  try {
    const html = katex.renderToString(value, {
      displayMode: display,
      throwOnError: false,
      strict: false,
    })
    const Tag = display ? 'div' : 'span'
    return <Tag className={display ? 'math-block' : 'math-inline'} dangerouslySetInnerHTML={{ __html: html }} />
  } catch {
    return <code className="math-fallback">{value}</code>
  }
}
