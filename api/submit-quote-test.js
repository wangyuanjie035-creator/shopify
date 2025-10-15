// 最简单的测试版本
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    success: true,
    message: 'submit-quote-test API工作正常！',
    timestamp: new Date().toISOString(),
    method: req.method
  });
}
