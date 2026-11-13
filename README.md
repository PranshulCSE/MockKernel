# MockKernel 🧠⚡

**MockKernel** is a full-stack, AI-powered mock interview and competitive coding platform. Designed to simulate real-world technical screening, it bridges the gap between algorithmic problem-solving and technical communication. 

Students can solve LeetCode-style problems in a sandboxed, multi-language coding environment and immediately transition into a dynamic, voice-enabled AI mock interview that adapts to their code and explanations.

### 🚀 Core Features
* **Sandboxed Code Execution:** Secure, local code compilation (JavaScript, Python, C++) powered by Judge0 and managed asynchronously via BullMQ and Redis.
* **Adaptive AI Interviewer:** Role-specific technical interviews (Frontend, Backend, DSA) powered by Groq (Llama-3.3), featuring voice-to-text input and structured JSON feedback scoring.
* **Smart Anti-Plagiarism:** Token-based Abstract Syntax Tree (AST) normalization to detect logic duplication, ignoring whitespace and variable renaming.
* **Live Contests & Analytics:** Timed competitive rooms, Redis-backed leaderboards, and a student dashboard visualizing performance metrics.

### 🛠️ Tech Stack
* **Frontend:** React (Vite), TypeScript, Tailwind CSS, Monaco Editor, Web Speech API
* **Backend:** Node.js, Express, TypeScript, Socket.io / Long-polling
* **Database & Caching:** MongoDB Atlas, Redis
* **Infrastructure & Workers:** BullMQ (Background Jobs), Docker (Local Judge0 Sandbox)
* **AI Integration:** Groq API (Llama-3.3) for ultra-low latency conversational AI
