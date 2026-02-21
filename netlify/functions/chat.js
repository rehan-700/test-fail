const SYSTEM_PROMPT = `
You are Codexx, the world's smartest autonomous website builder.

Rules:
- If user wants ANY website, ask 4-5 smart clarification questions first.
- If minimal info, assume smart modern defaults.
- When generating website: output short sentence + exactly ONE html code block.
- Use Tailwind CDN.
- Include Hero, About, Services, Testimonials, Blog (3 posts), Contact form (with JS), Footer.
- Modern, responsive, SEO meta tags.
- Nothing after closing code block.

For other questions: answer normally.
`;

exports.handler = async (event) => {

  if (event.httpMethod !== "POST") {
    return response(405, { error: "Method Not Allowed" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { messages = [], provider = "openrouter", model } = body;

    if (!messages.length) {
      return response(200, { content: "🚨 Error: No messages sent to AI." });
    }

    if (!model) {
      return response(200, { content: "🚨 No model selected." });
    }

    const userMessage = messages[messages.length - 1].content;
    const isWebsiteRequest = /build|create|make.*website|landing page/i.test(userMessage);

    let temperature = isWebsiteRequest ? 0.8 : 0.5;
    if (/debug|error|fix|code/i.test(userMessage)) temperature = 0.3;

    // =============================
    // OPENROUTER CALL (MAIN ENGINE)
    // =============================

    async function callOpenRouter() {

      if (!process.env.OPENROUTER_API_KEY)
        throw new Error("OPENROUTER_API_KEY is missing in Netlify Environments.");

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://codexx-12.netlify.app",
          "X-Title": "Codexx",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model, // 🔥 dynamic model from frontend
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages
          ],
          temperature,
          max_tokens: 4096
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(`OpenRouter Error: ${data.error?.message || "Unknown API Error"}`);
      }

      return data.choices[0].message.content;
    }

    // =============================
    // GEMINI BACKUP (Optional)
    // =============================

    async function callGemini() {

      if (!process.env.GEMINI_API_KEY)
        throw new Error("GEMINI_API_KEY is missing in Netlify Environments.");

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: messages.map((m) => ({
              role: m.role === "user" ? "user" : "model",
              parts: [{ text: m.content }]
            })),
            generationConfig: { temperature, maxOutputTokens: 4096 }
          })
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(`Gemini Error: ${data.error?.message || "Unknown API Error"}`);
      }

      return data.candidates[0].content.parts[0].text;
    }

    // =============================
    // EXECUTION LOGIC
    // =============================

    let apiResponse;
    let errors = [];

    try {
      apiResponse = await callOpenRouter();
    } catch (err1) {
      errors.push(err1.message);

      try {
        apiResponse = await callGemini();
      } catch (err2) {
        errors.push(err2.message);

        return response(200, {
          content: `🚨 **AI Connection Failed.**

**Reasons:**
- ${errors.join("\n- ")}

*(If you added API keys recently, click "Trigger Deploy" in Netlify.)*`
        });
      }
    }

    return response(200, { content: apiResponse });

  } catch (error) {
    return response(200, {
      content: `🚨 **Backend Error:** ${error.message}`
    });
  }
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}
