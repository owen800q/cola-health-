import { Hono } from 'hono';
import type { Bindings } from '../index';

export const memoryRoutes = new Hono<{ Bindings: Bindings }>();

const TEXT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

// GET /api/memories
memoryRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const memories = await db.prepare(
    'SELECT * FROM ai_memories ORDER BY created_at DESC'
  ).all();
  return c.json(memories.results);
});

// POST /api/memories
memoryRoutes.post('/', async (c) => {
  const db = c.env.DB;
  const { content, category } = await c.req.json();
  if (!content || typeof content !== 'string' || !content.trim()) {
    return c.json({ error: '請輸入記憶內容' }, 400);
  }
  const cat = category || 'general';
  const result = await db.prepare(
    'INSERT INTO ai_memories (content, category) VALUES (?, ?)'
  ).bind(content.trim(), cat).run();
  const memory = await db.prepare(
    'SELECT * FROM ai_memories WHERE id = ?'
  ).bind(result.meta.last_row_id).first();
  return c.json(memory, 201);
});

// PUT /api/memories/:id
memoryRoutes.put('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const { content, category } = await c.req.json();
  await db.prepare(`
    UPDATE ai_memories SET
      content = COALESCE(?, content),
      category = COALESCE(?, category),
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(content ?? null, category ?? null, id).run();
  const memory = await db.prepare('SELECT * FROM ai_memories WHERE id = ?').bind(id).first();
  if (!memory) return c.json({ error: '記憶不存在' }, 404);
  return c.json(memory);
});

// DELETE /api/memories/:id
memoryRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare('DELETE FROM ai_memories WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// POST /api/memories/extract — auto-extract memories from a conversation turn
memoryRoutes.post('/extract', async (c) => {
  const db = c.env.DB;
  const ai = c.env.AI;
  const { userMessage, aiMessage } = await c.req.json();

  if (!userMessage || !aiMessage) {
    return c.json({ extracted: 0 });
  }

  // Fetch existing memories to avoid duplicates
  const existing = await db.prepare(
    'SELECT content, category FROM ai_memories ORDER BY created_at DESC LIMIT 100'
  ).all();
  const existingList = existing.results
    .map((m: any) => `- [${m.category}] ${m.content}`)
    .join('\n') || '（暫無記憶）';

  const extractionPrompt = `你是一個記憶提取助手。分析以下對話，提取值得長期記住的重要事實。

規則：
1. 只提取明確陳述的事實，不要推測
2. 每條記憶用一句簡短的中文描述
3. 分類為：preference（偏好）、health（健康）、allergy（過敏）、routine（作息）、development（發育）、general（其他）
4. 如果沒有值得記住的新資訊，返回空數組
5. 不要重複已有的記憶

已有記憶：
${existingList}

對話：
用戶：${userMessage}
助手：${aiMessage}

請以 JSON 格式回覆，不要加任何其他文字：
[{"content": "...", "category": "..."}]

如果沒有新記憶，回覆：[]`;

  try {
    const response: any = await ai.run(TEXT_MODEL as any, {
      messages: [{ role: 'user', content: extractionPrompt }],
      max_tokens: 512,
      temperature: 0.1,
    });

    let text = response.response || '';
    // Strip markdown code fences if present
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    const memories = JSON.parse(text);
    if (!Array.isArray(memories) || memories.length === 0) {
      return c.json({ extracted: 0 });
    }

    const existingContents = new Set(existing.results.map((m: any) => m.content));
    let inserted = 0;

    for (const mem of memories) {
      if (!mem.content || typeof mem.content !== 'string' || !mem.content.trim()) continue;
      // Skip duplicates
      if (existingContents.has(mem.content.trim())) continue;

      const cat = ['preference', 'health', 'allergy', 'routine', 'development', 'general'].includes(mem.category)
        ? mem.category : 'general';

      await db.prepare(
        'INSERT INTO ai_memories (content, category, source_message) VALUES (?, ?, ?)'
      ).bind(mem.content.trim(), cat, userMessage.slice(0, 200)).run();
      inserted++;
    }

    return c.json({ extracted: inserted });
  } catch (e: any) {
    // Silently fail — extraction is best-effort
    console.error('Memory extraction error:', e?.message || e);
    return c.json({ extracted: 0 });
  }
});
