import { lazy, Suspense } from 'react'

// Chargé à la première description affichée : react-markdown pèse plus que le reste de l'interface.
const ReactMarkdown = lazy(() => import('react-markdown'))

/** Description en Markdown (Marketplace). Le HTML brut est ignoré ; les liens https s'ouvrent dans le navigateur. */
export function Markdown({ text }: { text: string }) {
  if (!text.trim()) return null
  return (
    <div className="markdown">
      <Suspense fallback={null}>
        <ReactMarkdown
          skipHtml
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
            img: () => null
          }}
        >
          {text}
        </ReactMarkdown>
      </Suspense>
    </div>
  )
}
