export default async function handler(req, res) {
  const token = process.env.NOTION_TOKEN
  if (!token) return res.status(500).json({ error: 'NOTION_TOKEN not configured' })

  const DATABASE_ID = '3385cf69-e1b6-80b1-b678-d7c4d210996d'

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: { '要修正': { checkbox: {} } }
      })
    })

    if (!response.ok) {
      const err = await response.text()
      return res.status(response.status).json({ error: err })
    }

    return res.status(200).json({ success: true, message: '要修正プロパティを追加しました' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
