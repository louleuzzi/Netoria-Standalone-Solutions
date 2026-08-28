// Netlify Edge Function that proxies requests to the Anthropic API.
// Streams the response back as it's generated so we never hit Netlify's
// 40-second response-header timeout, regardless of report length.
// The API key lives only in Netlify's environment variables (server-side),
// never in the browser, so visitors never see or need their own key.

export default async (request, context) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server is not configured with an API key.' }), { status: 500 });
  }

  let prompt;
  try {
    const body = await request.json();
    prompt = body.prompt;
    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing "prompt" in request body.' }), { status: 400 });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), { status: 400 });
  }

  const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      stream: true,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!anthropicResponse.ok || !anthropicResponse.body) {
    const errText = await anthropicResponse.text();
    return new Response(JSON.stringify({ error: `Anthropic API error: ${anthropicResponse.status} ${errText}` }), { status: anthropicResponse.status || 500 });
  }

  const reader = anthropicResponse.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const evt = JSON.parse(dataStr);
              if (evt.type === 'content_block_delta' && evt.delta && evt.delta.text) {
                controller.enqueue(encoder.encode(evt.delta.text));
              }
            } catch (e) { /* ignore partial/incomplete lines */ }
          }
        }
      }
      controller.close();
    }
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
};

export const config = {
  path: '/api/claude-proxy'
};
