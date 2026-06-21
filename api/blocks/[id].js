export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = process.env.NOTION_TOKEN
  if (!token) {
    return res.status(500).json({ error: 'NOTION_TOKEN not configured' })
  }

  const { id } = req.query

  try {
    const response = await fetch(`https://api.notion.com/v1/blocks/${id}/children?page_size=100`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28'
      }
    })

    if (!response.ok) {
      const err = await response.text()
      return res.status(response.status).json({ error: err })
    }

    const data = await response.json()

    const images = data.results
      .filter(block => block.type === 'image')
      .map(block => {
        const img = block.image
        const url = img.type === 'external' ? img.external.url : img.file?.url
        const caption = img.caption?.map(c => c.plain_text).join('') || ''
        return { url, caption }
      })
      .filter(img => img.url)

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ images })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
