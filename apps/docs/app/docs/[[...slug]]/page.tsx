import { notFound, redirect } from 'next/navigation'
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page'
import { source } from '../../../lib/source'
import { getMDXComponents } from '../../../mdx-components'

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params
  if (!params.slug || params.slug.length === 0) redirect('/docs/introduction')
  const page = source.getPage(params.slug)
  if (!page) notFound()

  const MDX = page.data.body

  return (
    <DocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  )
}

export async function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) return {}
  return { title: page.data.title, description: page.data.description }
}
