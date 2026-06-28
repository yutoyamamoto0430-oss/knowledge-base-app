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

  let body = {}
  try {
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body)
    } else if (req.body && typeof req.body === 'object') {
      body = req.body
    } else {
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

  const { title, answer, status, yushsei } = body

  try {
    // Content edit mode
    if (title !== undefined || answer !== undefined) {
      const properties = {}
      if (title !== undefined) properties.Title = { title: [{ text: { content: title } }] }
      if (answer !== undefined) properties.Answer = { rich_text: [{ text: { content: answer } }] }

      const r = await notionPatch(id, { properties }, token)
      if (!r.ok) return res.status(r.status).json({ error: await r.text() })
      return res.status(200).json({ success: true })
    }

    // Label update mode (status + yushsei)
    const properties = {}
    if (status !== undefined) properties.Status = { status: { name: status } }
    if (yushsei !== undefined) properties['要修正'] = { checkbox: yushsei }

    const r = await notionPatch(id, { properties }, token)
    if (!r.ok) return res.status(r.status).json({ error: await r.text() })
    return res.status(200).json({ success: true })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

function notionPatch(id, body, token) {
  return fetch(`https://api.notion.com/v1/pages/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
}
