export const config = { api: { bodyParser: true } }

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = process.env.NOTION_TOKEN
  if (!token) {
    return res.status(500).json({ error: 'NOTION_TOKEN not configured' })
  }

  const { id } = req.query

  // ボディを確実に取得
  let body = {}
  try {
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body)
    } else if (req.body && typeof req.body === 'object') {
      body = req.body
    } else {
      // ストリームから手動読み込み
      const raw = await new Promise((resolve, reject) => {
        let data = ''
        req.on('data', chunk => { data += chunk })
        req.on('end', () => resolve(data))
        req.on('error', reject)
      })
      body = raw ? JSON.parse(raw) : {}
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body: ' + e.message })
  }

  const { score, title, answer } = body

  try {
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
