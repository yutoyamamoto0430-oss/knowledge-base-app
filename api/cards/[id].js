export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = process.env.NOTION_TOKEN
  if (!token) {
    return res.status(500).json({ error: 'NOTION_TOKEN not configured' })
  }

  const { id } = req.query

  try {
    const { score, title, answer } = req.body || {}
    // 編集モード: title or answer が含まれる場合
    if (title !== undefined || answer !== undefined) {
      const properties = {}
      if (title !== undefined) {
        properties.Title = { title: [{ text: { content: title } }] }
      }
      if (answer !== undefined) {
        properties.Answer = { rich_text: [{ text: { content: answer } }] }
      }

      const response = await fetch(`https://api.notion.com/v1/pages/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      })

      if (!response.ok) {
        const err = await response.text()
        return res.status(response.status).json({ error: err })
      }

      return res.status(200).json({ success: true })
    }

    // スコアモード
    let newStatus
    if (score <= 2) newStatus = 'Focus'
    else if (score <= 4) newStatus = 'Active'
    else newStatus = 'Known'

    const response = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          Status: { status: { name: newStatus } }
        }
      })
    })

    if (!response.ok) {
      const err = await response.text()
      return res.status(response.status).json({ error: err })
    }

    return res.status(200).json({ success: true, status: newStatus })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
