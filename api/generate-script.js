export const config = {
  api: {
    bodyParser: { sizeLimit: '2mb' }
  }
};

function mockStoryboard(body = {}) {
  const productName = body.productName || 'Your Product';
  const screens = Array.isArray(body.screens) ? body.screens : [];
  const features = Array.isArray(body.keyFeatures) ? body.keyFeatures : [];
  const labels = screens.map((s, i) => s.label || `Screen ${i + 1}`);

  const base = [
    {
      type: 'hook',
      title: `Meet ${productName}`,
      voiceover: `${productName} helps users solve a real problem faster and with less effort.`,
      bullets: ['Clear value proposition', 'Modern experience', 'Fast onboarding'],
      visual: 'Open strong with app value and hero screen.',
      screenLabel: labels[0] || ''
    },
    {
      type: 'problem',
      title: 'The Problem',
      voiceover: `Today, users still waste time with fragmented workflows, confusing tools, and unnecessary steps.`,
      bullets: ['Too many steps', 'Confusing flow', 'Lost time'],
      visual: 'Show pain clearly before the solution.',
      screenLabel: labels[1] || labels[0] || ''
    },
    {
      type: 'solution',
      title: `${productName} Solves It`,
      voiceover: `${productName} brings everything into one smooth flow that feels fast, simple, and reliable.`,
      bullets: ['Single flow', 'Simple UI', 'Faster outcome'],
      visual: 'Show the product as the answer.',
      screenLabel: labels[2] || labels[0] || ''
    }
  ];

  features.slice(0, 3).forEach((feature, idx) => {
    base.push({
      type: 'feature',
      title: feature,
      voiceover: `${feature} helps the user get value immediately without friction.`,
      bullets: [feature, 'Easy to understand', 'Immediate benefit'],
      visual: 'Focus on the specific feature and the associated screen.',
      screenLabel: labels[Math.min(idx + 3, labels.length - 1)] || labels[0] || ''
    });
  });

  base.push({
    type: 'cta',
    title: 'Call to Action',
    voiceover: body.cta || `Try ${productName} today and see the difference for yourself.`,
    bullets: ['Try it today', 'See the value', 'Start fast'],
    visual: 'Close with a strong CTA and best-looking screen.',
    screenLabel: labels[labels.length - 1] || labels[0] || ''
  });

  return base;
}

async function openAIStoryboard(apiKey, body) {
  const prompt = `Return strictly valid JSON with this shape: {"storyboard":[{"type":"","title":"","voiceover":"","bullets":[""],"visual":"","screenLabel":"","duration":5}]}
Create a concise product demo storyboard.
Product name: ${body.productName}
Product description: ${body.productDescription}
Audience: ${body.targetAudience}
Tone: ${body.tone}
Goal: ${body.videoGoal}
CTA: ${body.cta}
Features: ${(body.keyFeatures || []).join(', ')}
Optimized prompt: ${body.buildPrompt}
Screens: ${(body.screens || []).map(s => s.label || s.name).join(', ')}`;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      messages: [
        { role: 'system', content: 'You generate compact, structured product demo storyboards.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  const json = await resp.json();
  if (!resp.ok) throw new Error(json?.error?.message || 'OpenAI request failed');
  const content = json?.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

async function geminiStoryboard(apiKey, body) {
  const prompt = `Return strictly valid JSON only. Shape: {"storyboard":[{"type":"","title":"","voiceover":"","bullets":[""],"visual":"","screenLabel":"","duration":5}]}
Create a concise product demo storyboard.
Product name: ${body.productName}
Product description: ${body.productDescription}
Audience: ${body.targetAudience}
Tone: ${body.tone}
Goal: ${body.videoGoal}
CTA: ${body.cta}
Features: ${(body.keyFeatures || []).join(', ')}
Optimized prompt: ${body.buildPrompt}
Screens: ${(body.screens || []).map(s => s.label || s.name).join(', ')}`;

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  const json = await resp.json();
  if (!resp.ok) throw new Error(json?.error?.message || 'Gemini request failed');
  const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body || {};
    const provider = body.provider || 'mock';

    if (provider === 'openai') {
      if (!body.apiKey) return res.status(400).json({ error: 'Missing OpenAI API key' });
      const data = await openAIStoryboard(body.apiKey, body);
      return res.status(200).json(data);
    }

    if (provider === 'gemini') {
      if (!body.apiKey) return res.status(400).json({ error: 'Missing Gemini API key' });
      const data = await geminiStoryboard(body.apiKey, body);
      return res.status(200).json(data);
    }

    return res.status(200).json({
      storyboard: mockStoryboard(body),
      warning: 'Generated with mock fallback.'
    });
  } catch (error) {
    console.error('generate-script failed:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
