import dotenv from 'dotenv';
import braintree from 'braintree';

dotenv.config();

export const gateway = new braintree.BraintreeGateway({
    environment: braintree.Environment.Sandbox,
    merchantId: process.env.BRAINTREE_MERCHANT_ID,
    publicKey: process.env.BRAINTREE_PUBLIC_KEY,
    privateKey: process.env.BRAINTREE_PRIVATE_KEY,
});

export async function sale({ amount, paymentMethodNonce, deviceData, submitForSettlement = true }) {
    return gateway.transaction.sale({
        amount: String(amount),
        paymentMethodNonce,
        deviceData,
        options: { submitForSettlement },
    });
}

export async function refund(transactionId, amount) {
    if (amount) {
        return gateway.transaction.refund(String(transactionId), String(amount));
    }
    return gateway.transaction.refund(String(transactionId));
}
