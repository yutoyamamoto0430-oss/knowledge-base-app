export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = process.env.NOTION_TOKEN
  if (!token) {
    return res.status(500).json({ error: 'NOTION_TOKEN not configured' })
  }

  const DATABASE_ID = '3385cf69-e1b6-80b1-b678-d7c4d210996d'
  const allResults = []
  let cursor = undefined

  try {
    do {
      const body = {
        page_size: 100,
        sorts: [{ timestamp: 'created_time', direction: 'ascending' }]
      }
      if (cursor) body.start_cursor = cursor

      const response = await fetch(
        `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        }
      )

      if (!response.ok) {
        const err = await response.text()
        return res.status(response.status).json({ error: err })
      }

      const data = await response.json()
      allResults.push(...data.results)
      cursor = data.has_more ? data.next_cursor : undefined
    } while (cursor)

    const cards = allResults.map(page => {
      const titleProp = page.properties?.Title
      const title = titleProp?.title?.[0]?.plain_text || ''

      const answerProp = page.properties?.Answer
      const answer = answerProp?.rich_text?.map(rt => rt.plain_text).join('') || ''

      const typeProp = page.properties?.Type
      const types = typeProp?.multi_select?.map(s => s.name) || []

      const tagProp = page.properties?.Tag
      const tags = tagProp?.multi_select?.map(s => s.name) || []

      const statusProp = page.properties?.Status
      const status = statusProp?.status?.name || 'Active'

      return {
        id: page.id,
        title,
        answer,
        type: types[0] || 'Vocabulary',
        tags,
        status,
        created_time: page.created_time,
        last_edited_time: page.last_edited_time
      }
    })

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ cards })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
