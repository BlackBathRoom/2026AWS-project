const express = require('express');
const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/', (req, res) => {
  res.send('AI学習システム - API');
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on ${port}`));
