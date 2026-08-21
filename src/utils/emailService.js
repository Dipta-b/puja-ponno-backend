const nodemailer = require("nodemailer");

// Dynamic Transporter helper for Gmail
const getTransporter = () => {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

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
        if (!transporter || !order?.email) return;

        const emailUser = process.env.EMAIL_USER;

        // Build Itemized HTML Table Row Elements
        let itemsHtml = "";
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach((item) => {
                const itemTotal = Number(item.price || 0) * Number(item.quantity || 1);
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
                    <p style="font-size: 16px; color: #333;">Dear <strong>${order.name || 'Customer'}</strong>,</p>
                    <p style="font-size: 15px; color: #555;">We have successfully received your payment. Below are the details of your confirmed order:</p>
                    
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Transaction ID:</strong> ${order.tran_id}</p>
                        <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date(order.createdAt || Date.now()).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })}</p>
                        <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #2e7d32; font-weight: bold;">PAID & CONFIRMED</span></p>
                    </div>
                    
                    <h3 style="color: #333; margin-bottom: 10px; border-bottom: 2px solid #ff9800; padding-bottom: 5px; display: inline-block;">Shipping Details</h3>
                    <p style="margin: 4px 0; color: #555;"><strong>Address:</strong> ${order.address || 'N/A'}</p>
                    <p style="margin: 4px 0; color: #555;"><strong>Phone:</strong> ${order.phone || 'N/A'}</p>
                    <p style="margin: 4px 0; color: #555;"><strong>Email:</strong> ${order.email}</p>

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
                                <td style="padding: 15px 12px; text-align: right; font-weight: bold; font-size: 16px; color: #d32f2f; border-top: 2px solid #d32f2f;">৳${order.amount || 0}</td>
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
            to: order.email,
            subject: `Order Confirmed! Your Puja Items [${order.tran_id}]`,
            html: htmlContent
        };

        if (emailUser) {
            mailOptions.bcc = emailUser;
        }

        await transporter.sendMail(mailOptions);
        console.log("✅ Success Email Sent to:", order.email);
    } catch (err) {
        console.error("❌ Nodemailer Exception (Success):", err.message);
    }
};

const sendFailEmail = async (order) => {
    try {
        const transporter = getTransporter();
        if (!transporter || !order?.email) return;

        const emailUser = process.env.EMAIL_USER;

        await transporter.sendMail({
            from: `"Nitya Puja" <${emailUser}>`,
            to: order.email,
            subject: `Payment Failed - Action Required [${order.tran_id}]`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #fee; border-radius: 8px;">
                    <div style="background-color: #d32f2f; color: #fff; padding: 20px; text-align: center;">
                        <h2 style="margin: 0;">Payment Failed!</h2>
                    </div>
                    <div style="padding: 20px;">
                        <p>Dear ${order.name || 'Customer'},</p>
                        <p>Unfortunately, your payment attempt for order <strong>${order.tran_id}</strong> was unsuccessful or cancelled.</p>
                        <p style="background: #f9f9f9; padding: 10px; border-left: 4px solid #ff9800;">
                           Your cart items are still available. Please try checking out again using a different payment method.
                        </p>
                    </div>
                </div>
            `
        });
        console.log("⚠️ Failure Email Sent to:", order.email);
    } catch (err) {
        console.error("❌ Nodemailer Exception (Fail):", err.message);
    }
};

module.exports = { sendSuccessEmail, sendFailEmail };