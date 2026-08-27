// Netlify serverless function that proxies requests to the Anthropic API.
// The API key lives only in Netlify's environment variables (server-side),
// never in the browser, so visitors never see or need their own key.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server is not configured with an API key. Set ANTHROPIC_API_KEY in Netlify environment variables.' })
    };
  }

  let prompt;
  try {
    const body = JSON.parse(event.body || '{}');
    prompt = body.prompt;
    if (!prompt || typeof prompt !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing "prompt" in request body.' }) };
    }
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
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
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data?.error?.message || `Anthropic API error: ${response.status}` })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ text: data.content[0].text })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Request to Anthropic failed: ' + err.message }) };
  }
};
