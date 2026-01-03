import dotenv from 'dotenv';
dotenv.config();

const isTest = process.env.NODE_ENV === 'test';

function requireEnv(name) {
    const val = process.env[name];
    if (!val && !isTest) {
        console.warn(`[config] Missing env var ${name}. Set in .env`);
    }
    return val;
}

export const config = {
    PORT: Number(process.env.PORT || 3002),
    BRAINTREE_MERCHANT_ID: requireEnv('BRAINTREE_MERCHANT_ID'),
    BRAINTREE_PUBLIC_KEY: requireEnv('BRAINTREE_PUBLIC_KEY'),
    BRAINTREE_PRIVATE_KEY: requireEnv('BRAINTREE_PRIVATE_KEY'),
    isTest,
};
