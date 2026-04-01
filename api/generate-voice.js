export const config = {
  api: {
    bodyParser: { sizeLimit: '1mb' }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { apiKey, voiceId, text } = req.body || {};

    if (!apiKey || !String(apiKey).trim()) {
      return res.status(400).json({ error: 'Missing ElevenLabs API key' });
    }
    if (!voiceId || !String(voiceId).trim()) {
      return res.status(400).json({ error: 'Missing ElevenLabs voice ID' });
    }
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Missing text for voice generation' });
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(String(voiceId).trim())}?output_format=mp3_44100_128`;

    const elevenResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': String(apiKey).trim()
      },
      body: JSON.stringify({
        text: String(text).trim(),
        model_id: 'eleven_multilingual_v2'
      })
    });

    if (!elevenResponse.ok) {
      const errorText = await elevenResponse.text();
      return res.status(elevenResponse.status).json({
        error: `ElevenLabs error: ${errorText || elevenResponse.statusText}`
      });
    }

    const arrayBuffer = await elevenResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!buffer.length) {
      return res.status(500).json({ error: 'ElevenLabs returned empty audio' });
    }

    return res.status(200).json({
      ok: true,
      mimeType: 'audio/mpeg',
      audioBase64: buffer.toString('base64')
    });
  } catch (error) {
    console.error('generate-voice failed:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown server error'
    });
  }
}
