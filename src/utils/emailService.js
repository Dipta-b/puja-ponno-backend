const nodemailer = require("nodemailer");

// Dynamic Transporter helper for Gmail
const getTransporter = () => {
    const user = process.env.EMAIL_USER || process.env.GMAIL_USER;
    const pass = (process.env.EMAIL_PASS || process.env.GMAIL_PASS || "").replace(/\s+/g, "");

    if (!user || !pass) {
        console.warn("⚠️ EMAIL_USER or EMAIL_PASS not set in environment variables. Email notification skipped.");
        return null;
    }

    return nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: user,
            pass: pass
        }
    });
};

const sendSuccessEmail = async (order) => {
    try {
        const transporter = getTransporter();
        const emailUser = process.env.EMAIL_USER || process.env.GMAIL_USER;
        
        if (!transporter) {
            console.warn("⚠️ Nodemailer skipped: Transporter not configured (EMAIL_USER/EMAIL_PASS missing).");
            return;
        }

        let recipientEmail = order?.email || order?.customer?.email;
        if (!recipientEmail || recipientEmail === "customer@example.com") {
            recipientEmail = emailUser;
        }

        if (!recipientEmail) {
            console.warn("⚠️ Nodemailer skipped: No recipient email found in order object.", order);
            return;
        }

        const recipientName = order?.name || order?.customer?.name || "Valued Customer";
        const tranId = order?.tran_id || order?.payment?.transactionId || "TXN_SUCCESS";
        const amount = order?.amount || order?.pricing?.totalAmount || order?.totalAmount || 0;
        const address = order?.address || order?.customer?.address || "N/A";
        const phone = order?.phone || order?.customer?.phone || "N/A";

        // Build Itemized HTML Table Row Elements
        let itemsHtml = "";
        const items = order.items || order.customer?.items || [];
        if (items && Array.isArray(items)) {
            items.forEach((item) => {
                const itemTotal = Number(item.price || item.discountPrice || 0) * Number(item.quantity || 1);
                itemsHtml += `
                    <tr>
                        <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">${item.name || 'Item'}</td>
                        <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: center;">${item.quantity || 1}</td>
                        <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">৳${itemTotal}</td>
                    </tr>
                `;
            });
        }

        const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                <div style="background: linear-gradient(135deg, #d32f2f, #ff9800); color: #fff; padding: 25px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">Nitya Puja - Payment Confirmed!</h1>
                    <p style="margin: 5px 0 0; font-size: 14px; opacity: 0.9;">Your divine elements are on their way</p>
                </div>
                
                <div style="padding: 30px;">
                    <p style="font-size: 16px; color: #333;">Dear <strong>${recipientName}</strong>,</p>
                    <p style="font-size: 15px; color: #555;">We have successfully received your payment. Below are the details of your confirmed order:</p>
                    
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Transaction ID:</strong> ${tranId}</p>
                        <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date(order.createdAt || Date.now()).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })}</p>
                        <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #2e7d32; font-weight: bold;">PAID & CONFIRMED</span></p>
                    </div>
                    
                    <h3 style="color: #333; margin-bottom: 10px; border-bottom: 2px solid #ff9800; padding-bottom: 5px; display: inline-block;">Shipping Details</h3>
                    <p style="margin: 4px 0; color: #555;"><strong>Address:</strong> ${address}</p>
                    <p style="margin: 4px 0; color: #555;"><strong>Phone:</strong> ${phone}</p>
                    <p style="margin: 4px 0; color: #555;"><strong>Email:</strong> ${recipientEmail}</p>

                    <h3 style="color: #333; margin-top: 30px; border-bottom: 2px solid #ff9800; padding-bottom: 5px; display: inline-block;">Order Items</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px;">
                        <thead>
                            <tr style="background-color: #fce4ec; color: #d32f2f;">
                                <th style="padding: 12px; text-align: left;">Item</th>
                                <th style="padding: 12px; text-align: center;">Qty</th>
                                <th style="padding: 12px; text-align: right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="2" style="padding: 15px 12px; text-align: right; font-weight: bold; font-size: 16px; border-top: 2px solid #d32f2f;">Grand Total:</td>
                                <td style="padding: 15px 12px; text-align: right; font-weight: bold; font-size: 16px; color: #d32f2f; border-top: 2px solid #d32f2f;">৳${amount}</td>
                            </tr>
                        </tfoot>
                    </table>
                    
                    <div style="margin-top: 40px; text-align: center; color: #777; font-size: 12px;">
                        <p>If you have any questions, reply to this email.</p>
                        <p>&copy; ${new Date().getFullYear()} Nitya Puja E-commerce. All rights reserved.</p>
                    </div>
                </div>
            </div>
        `;

        const mailOptions = {
            from: `"Nitya Puja Store" <${emailUser}>`,
            to: recipientEmail,
            subject: `Order Confirmed! Your Puja Items [${tranId}]`,
            html: htmlContent
        };

        if (emailUser && recipientEmail.toLowerCase() !== emailUser.toLowerCase()) {
            mailOptions.bcc = emailUser;
        }

        const info = await transporter.sendMail(mailOptions);
        console.log("✅ Success Email Sent to:", recipientEmail, "MessageID:", info.messageId);
    } catch (err) {
        console.error("❌ Nodemailer Exception (Success):", err.message);
    }
};

const sendFailEmail = async (order) => {
    try {
        const transporter = getTransporter();
        const emailUser = process.env.EMAIL_USER || process.env.GMAIL_USER;
        let recipientEmail = order?.email || order?.customer?.email || emailUser;
        
        if (!transporter || !recipientEmail) return;

        const recipientName = order?.name || order?.customer?.name || "Customer";
        const tranId = order?.tran_id || order?.payment?.transactionId || "TXN_FAILED";

        const mailOptions = {
            from: `"Nitya Puja" <${emailUser}>`,
            to: recipientEmail,
            subject: `Payment Failed - Action Required [${tranId}]`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #fee; border-radius: 8px;">
                    <div style="background-color: #d32f2f; color: #fff; padding: 20px; text-align: center;">
                        <h2 style="margin: 0;">Payment Failed!</h2>
                    </div>
                    <div style="padding: 20px;">
                        <p>Dear ${recipientName},</p>
                        <p>Unfortunately, your payment attempt for order <strong>${tranId}</strong> was unsuccessful or cancelled.</p>
                        <p style="background: #f9f9f9; padding: 10px; border-left: 4px solid #ff9800;">
                           Your cart items are still available. Please try checking out again using a different payment method.
                        </p>
                    </div>
                </div>
            `
        };

        if (emailUser && recipientEmail.toLowerCase() !== emailUser.toLowerCase()) {
            mailOptions.bcc = emailUser;
        }

        await transporter.sendMail(mailOptions);
        console.log("⚠️ Failure Email Sent to:", recipientEmail);
    } catch (err) {
        console.error("❌ Nodemailer Exception (Fail):", err.message);
    }
};

module.exports = { sendSuccessEmail, sendFailEmail };