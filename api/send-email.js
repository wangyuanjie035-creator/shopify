// 报价邮件发送 API
// 使用简单的方案：生成邮件内容，返回给前端通过 mailto 或显示给客服

export default async function handler(req, res) {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { orderId, email, files, amount, note } = req.body;

    if (!email || !amount) {
      return res.status(400).json({ error: 'Missing required fields: email, amount' });
    }

    // 构建邮件内容
    const subject = `报价通知 - 订单 #${orderId ? orderId.substring(0, 8) : 'N/A'}`;
    
    const emailBody = `
尊敬的客户，

您好！您的定制加工询价已完成报价，详情如下：

━━━━━━━━━━━━━━━━━━━━━━━━
📋 订单信息
━━━━━━━━━━━━━━━━━━━━━━━━
订单号：${orderId || 'N/A'}
文件：${files || 'N/A'}
报价金额：¥${amount}
${note ? `备注：${note}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━
💳 下一步操作
━━━━━━━━━━━━━━━━━━━━━━━━
1. 请访问我们的商店确认订单
2. 在购物车中查看报价详情
3. 如有疑问，请随时联系客服

━━━━━━━━━━━━━━━━━━━━━━━━
🔧 加工说明
━━━━━━━━━━━━━━━━━━━━━━━━
我们将根据您的文件和要求进行精密加工，
确保产品质量符合您的期望。

━━━━━━━━━━━━━━━━━━━━━━━━
📞 联系我们
━━━━━━━━━━━━━━━━━━━━━━━━
如有任何疑问，请随时联系客服团队。

感谢您选择我们的服务！

此致
定制化加工服务团队

━━━━━━━━━━━━━━━━━━━━━━━━
此邮件由系统自动生成，请勿直接回复。
    `.trim();

    // 生成 HTML 版本
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>报价通知</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
    <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 600;">🎉 报价已完成</h1>
            <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">定制化加工服务</p>
        </div>
        
        <!-- Body -->
        <div style="padding: 40px 30px;">
            <p style="margin: 0 0 20px 0; color: #333; font-size: 16px; line-height: 1.6;">尊敬的客户，</p>
            <p style="margin: 0 0 30px 0; color: #666; font-size: 15px; line-height: 1.6;">您好！您的定制加工询价已完成报价，详情如下：</p>
            
            <!-- Order Info -->
            <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                <h2 style="margin: 0 0 15px 0; color: #333; font-size: 18px; font-weight: 600;">📋 订单信息</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px 0; color: #666; font-size: 14px;">订单号：</td>
                        <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 500;">${orderId || 'N/A'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #666; font-size: 14px;">文件：</td>
                        <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 500;">${files || 'N/A'}</td>
                    </tr>
                    ${note ? `
                    <tr>
                        <td style="padding: 8px 0; color: #666; font-size: 14px;">备注：</td>
                        <td style="padding: 8px 0; color: #333; font-size: 14px;">${note}</td>
                    </tr>
                    ` : ''}
                </table>
            </div>
            
            <!-- Price -->
            <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 8px; padding: 25px; margin-bottom: 20px; text-align: center;">
                <p style="margin: 0 0 5px 0; color: white; font-size: 14px; opacity: 0.9;">报价金额</p>
                <p style="margin: 0; color: white; font-size: 36px; font-weight: bold;">¥${amount}</p>
            </div>
            
            <!-- Next Steps -->
            <div style="background: #e3f2fd; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 15px 0; color: #1976d2; font-size: 16px; font-weight: 600;">💳 下一步操作</h3>
                <ol style="margin: 0; padding-left: 20px; color: #555; font-size: 14px; line-height: 1.8;">
                    <li>请访问我们的商店确认订单</li>
                    <li>在购物车中查看报价详情</li>
                    <li>如有疑问，请随时联系客服</li>
                </ol>
            </div>
            
            <!-- Service Info -->
            <div style="background: #f1f8e9; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0; color: #558b2f; font-size: 16px; font-weight: 600;">🔧 加工说明</h3>
                <p style="margin: 0; color: #555; font-size: 14px; line-height: 1.6;">我们将根据您的文件和要求进行精密加工，确保产品质量符合您的期望。</p>
            </div>
            
            <!-- Contact -->
            <div style="border-top: 2px solid #f0f0f0; padding-top: 20px; margin-top: 20px;">
                <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">📞 如有任何疑问，请随时联系客服团队。</p>
                <p style="margin: 0; color: #333; font-size: 14px; font-weight: 500;">感谢您选择我们的服务！</p>
            </div>
        </div>
        
        <!-- Footer -->
        <div style="background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e0e0e0;">
            <p style="margin: 0; color: #999; font-size: 12px;">此邮件由系统自动生成，请勿直接回复</p>
            <p style="margin: 5px 0 0 0; color: #999; font-size: 12px;">© 定制化加工服务</p>
        </div>
    </div>
</body>
</html>
    `.trim();

    // 返回邮件内容
    return res.status(200).json({
      success: true,
      email: {
        to: email,
        subject: subject,
        textBody: emailBody,
        htmlBody: htmlBody
      },
      mailto: `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`
    });

  } catch (error) {
    console.error('邮件内容生成错误:', error);
    return res.status(500).json({ 
      error: '邮件内容生成失败', 
      details: error.message 
    });
  }
}
