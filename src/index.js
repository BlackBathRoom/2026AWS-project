const express = require('express');
const { generateAiResponse } = require('./services/aiService');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/', (req, res) => {
  res.send('AI学習システム - API');
});

app.post('/v1/tutor/ask', async (req, res) => {
  try {
    const result = await generateAiResponse(req.body && req.body.question);
    res.json(result);
  } catch (error) {
    console.error('AI processing error:', error?.name || 'UnknownError');
    res.status(500).json({
      status: 'ERROR',
      answer: 'AI処理中にエラーが発生しました。',
      citations: [],
    });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    status: 'ERROR',
    answer: 'サーバー内部でエラーが発生しました。',
    citations: [],
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on ${port}`));
