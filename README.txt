HUNDY GUIDE – REAL AI SETUP

1. Upload this entire folder to your GitHub repository.
2. Import the repository into Vercel.
3. In Vercel: Project Settings > Environment Variables
4. Add:
   OPENAI_API_KEY = your OpenAI API key
5. Optional:
   OPENAI_MODEL = gpt-5-mini
6. Redeploy.

IMPORTANT: Never put OPENAI_API_KEY inside index.html.
The website sends chat requests to /api/chat, and the server securely calls the AI.
