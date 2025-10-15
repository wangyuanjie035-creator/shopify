// 完全基于hello.js的版本
export default function handler(req, res) {
  res.status(200).json({ 
    message: 'submit-quote-copy API工作正常！',
    timestamp: new Date().toISOString(),
    success: true
  });
}
