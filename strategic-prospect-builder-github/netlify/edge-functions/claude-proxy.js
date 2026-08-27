// Netlify Edge Function that proxies requests to the Anthropic API.
// Edge Functions have a far higher execution time limit than standard
// serverless Functions, which is required for AI-generation calls.
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

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    console.log('RAW_CLAUDE_RESPONSE:', JSON.stringify(data));

    if (!response.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || `Anthropic API error: ${response.status}` }), { status: response.status });
    }

    return new Response(JSON.stringify({ text: data.content[0].text }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Request to Anthropic failed: ' + err.message }), { status: 500 });
  }
};

export const config = {
  path: '/api/claude-proxy'
};
