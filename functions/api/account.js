import { handlers } from '../../server/cloudSaves.js';
export const onRequest = (context) => handlers.account(context);
