import { handlers } from '../../server/cloudSaves.js';
export const onRequest = (context) => handlers.saves(context);
