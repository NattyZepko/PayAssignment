import braintree from 'braintree';
import { config } from './config.js';

export const gateway = new braintree.BraintreeGateway({
    environment: braintree.Environment.Sandbox,
    merchantId: config.BRAINTREE_MERCHANT_ID,
    publicKey: config.BRAINTREE_PUBLIC_KEY,
    privateKey: config.BRAINTREE_PRIVATE_KEY,
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

export async function voidTxn(transactionId) {
    return gateway.transaction.void(String(transactionId));
}
