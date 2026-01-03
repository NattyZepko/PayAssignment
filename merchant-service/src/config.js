import dotenv from 'dotenv';
dotenv.config();

export const config = {
    PORT: Number(process.env.PORT || 3001),
    ORCHESTRATOR_BASE_URL: process.env.ORCHESTRATOR_BASE_URL || 'http://localhost:3002',
};
